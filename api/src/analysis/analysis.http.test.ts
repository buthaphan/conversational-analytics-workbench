import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TEST_ORIGIN,
  type TestApp,
  createTestApp,
  createUser,
  resetDatabase,
  sessionCookie,
} from "../test/app";
import { ANSWERS } from "./answers/answers";
import { DataSource } from "./data/data-source";
import { DEMO_EXAMPLES } from "./llm/demo-llm-client";

describe("analysis HTTP API (TASK-003 AC-12, AC-13, AC-15)", () => {
  let t: TestApp;
  const http = () => request(t.app.getHttpServer());
  const signIn = async (email: string) => {
    const response = await http()
      .post("/api/auth/sign-in")
      .set("Origin", TEST_ORIGIN)
      .send({ email, password: "pw-123456" });
    return sessionCookie(response) as string;
  };
  const getState = (token: string) =>
    http().get("/api/analysis/state").set("Cookie", `cawb_session=${token}`);
  const send = (token: string, body: unknown, origin = TEST_ORIGIN) =>
    http()
      .post("/api/analysis/messages")
      .set("Origin", origin)
      .set("Cookie", `cawb_session=${token}`)
      .send(body as object);
  const choose = (token: string, body: unknown) =>
    http()
      .post("/api/analysis/switch")
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", `cawb_session=${token}`)
      .send(body as object);

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    vi.restoreAllMocks();
    await createUser(t.prisma, "user@example.test", "pw-123456");
    await createUser(t.prisma, "other@example.test", "pw-123456");
  });

  it("starts empty, with the demo examples, and is never cached", async () => {
    const token = await signIn("user@example.test");
    const response = await getState(token);
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toEqual({
      messages: [],
      activeResult: null,
      pending: null,
      notice: null,
      demoExamples: DEMO_EXAMPLES,
    });
  });

  it("answers a message with the reply and the new state (AC-4)", async () => {
    const token = await signIn("user@example.test");
    const fetch = vi.spyOn(t.app.get(DataSource), "fetch");
    const response = await send(token, { text: "The previous calendar year" });
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(response.body.reply.text).toMatch(
      /^Showing 10 of [\d,]+ customers, 1 Jan 2025 – 31 Dec 2025, by total spend \(highest first\)\.$/,
    );
    expect(response.body.state.activeResult).toMatchObject({
      capability: "customer_spending",
      view: { limit: 10, view: "bar" },
    });
    expect(response.body.state.activeResult.rows).toHaveLength(10);
    expect(response.body.state.messages.map((m: { role: string }) => m.role)).toEqual([
      "user",
      "assistant",
    ]);
  });

  describe("protection (AC-12)", () => {
    it("requires a session", async () => {
      expect((await http().get("/api/analysis/state")).status).toBe(401);
      const post = await http()
        .post("/api/analysis/messages")
        .set("Origin", TEST_ORIGIN)
        .send({ text: "hi" });
      expect(post.status).toBe(401);
    });

    it("rejects POSTs from another origin", async () => {
      const token = await signIn("user@example.test");
      expect((await send(token, { text: "hi" }, "https://evil.example.test")).status).toBe(403);
      expect(
        (
          await http()
            .post("/api/analysis/switch")
            .set("Cookie", `cawb_session=${token}`)
            .send({ choice: "keep" })
        ).status,
      ).toBe(403);
    });

    it.each([
      [{}],
      [{ text: "" }],
      [{ text: "   " }],
      [{ text: "x".repeat(501) }],
      [{ text: 42 }],
      [{ text: "hi", extra: true }],
    ])("rejects the message body %j", async (body) => {
      const token = await signIn("user@example.test");
      expect((await send(token, body)).status).toBe(400);
    });

    it("accepts a 500-character message", async () => {
      const token = await signIn("user@example.test");
      expect((await send(token, { text: "x".repeat(500) })).status).toBe(200);
    });

    it.each([[{}], [{ choice: "maybe" }], [{ choice: "switch", extra: 1 }]])(
      "rejects the switch body %j",
      async (body) => {
        const token = await signIn("user@example.test");
        expect((await choose(token, body)).status).toBe(400);
      },
    );

    it("keeps each user's analysis separate", async () => {
      const mine = await signIn("user@example.test");
      const theirs = await signIn("other@example.test");
      await send(mine, { text: "The previous calendar year" });
      const other = await getState(theirs);
      expect(other.body).toMatchObject({ messages: [], activeResult: null });
    });

    it("serializes concurrent messages from one session", async () => {
      const token = await signIn("user@example.test");
      await send(token, { text: "The previous calendar year" });
      const responses = await Promise.all([
        send(token, { text: "Show the lowest spenders" }),
        send(token, { text: "Show this as a table" }),
        send(token, { text: "Only customers who spent over $500" }),
      ]);
      expect(responses.map((r) => r.status)).toEqual([200, 200, 200]);
      const state = (await getState(token)).body;
      expect(state.messages.map((m: { seq: number }) => m.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(state.activeResult.view).toMatchObject({
        view: "table",
        sort: { direction: "asc" },
        filters: [{ field: "total_spend" }],
      });
    });

    it("stops at 200 messages per analysis session", async () => {
      const token = await signIn("user@example.test");
      await send(token, { text: "hello" });
      await t.prisma.analysisSession.updateMany({ data: { messageCount: 199 } });
      const response = await send(token, { text: "hello" });
      expect(response.body.reply.text).toBe(ANSWERS.messageLimit);
    });
  });

  describe("refresh and session end (AC-13)", () => {
    it("returns the same state after a refresh", async () => {
      const token = await signIn("user@example.test");
      await send(token, { text: "The previous calendar year" });
      const { body } = await send(token, { text: "Show product sales instead" });
      expect((await getState(token)).body).toEqual({ ...body.state, demoExamples: DEMO_EXAMPLES });
      expect(body.state.pending).toMatchObject({
        type: "switch",
        capability: "product_sales_performance",
      });
    });

    it("starts a fresh analysis after signing out and in again", async () => {
      let token = await signIn("user@example.test");
      await send(token, { text: "The previous calendar year" });
      await http()
        .post("/api/auth/sign-out")
        .set("Origin", TEST_ORIGIN)
        .set("Cookie", `cawb_session=${token}`);
      expect(await t.prisma.resultSet.count()).toBe(0);
      token = await signIn("user@example.test");
      expect((await getState(token)).body).toMatchObject({
        messages: [],
        activeResult: null,
        pending: null,
      });
    });
  });
});
