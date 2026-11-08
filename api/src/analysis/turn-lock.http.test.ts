import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { IDLE_TIMEOUT_MS } from "../config/config";
import { SessionSweeper } from "../sessions/session.sweeper";
import {
  TEST_ORIGIN,
  type TestApp,
  createTestApp,
  createUser,
  resetDatabase,
  sessionCookie,
} from "../test/app";
import { Gate } from "../test/gate";
import { CAPABILITIES } from "./capabilities/registry";
import { DataSource } from "./data/data-source";
import { ResultEngine } from "./engine/result-engine";
import { LlmClient } from "./llm/llm-client";
import { TURN_DEADLINE_MS } from "./orchestrator/orchestrator";

/**
 * TASK-004 AC-1 (DEC-001): no lock is held while the model or the data source works, so session
 * end, sign-in elsewhere, and refresh never wait on a slow turn, and a late outcome is discarded.
 */
describe("two-phase turn (TASK-004 AC-1)", () => {
  let t: TestApp;
  const http = () => request(t.app.getHttpServer());
  const signIn = async (email = "user@example.test") => {
    const response = await http()
      .post("/api/auth/sign-in")
      .set("Origin", TEST_ORIGIN)
      .send({ email, password: "pw-123456" });
    expect(response.status).toBe(200);
    return sessionCookie(response) as string;
  };
  const getState = (token: string) =>
    http().get("/api/analysis/state").set("Cookie", `cawb_session=${token}`);
  const send = (token: string, text: string) =>
    http()
      .post("/api/analysis/messages")
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", `cawb_session=${token}`)
      .send({ text });
  const choose = (token: string, choice: "switch" | "keep") =>
    http()
      .post("/api/analysis/switch")
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", `cawb_session=${token}`)
      .send({ choice });
  const signOut = (token: string) =>
    http()
      .post("/api/auth/sign-out")
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", `cawb_session=${token}`);
  /** Starts a request without waiting for it (supertest sends on `then`). */
  const start = (test: request.Test) => test.then((response) => response);

  /** The next model call waits at the gate; later calls behave normally. */
  const holdModel = () => {
    const llm = t.app.get(LlmClient);
    const original = llm.decide.bind(llm);
    const gate = new Gate();
    let held = false;
    vi.spyOn(llm, "decide").mockImplementation(async (context, text) => {
      if (!held) {
        held = true;
        await gate.wait();
      }
      return original(context, text);
    });
    return gate;
  };

  /** The next retrieval waits at the gate. */
  const holdFetch = () => {
    const data = t.app.get(DataSource);
    const original = data.fetch.bind(data);
    const gate = new Gate();
    let held = false;
    vi.spyOn(data, "fetch").mockImplementation(async (capability, scope) => {
      if (!held) {
        held = true;
        await gate.wait();
      }
      return original(capability, scope);
    });
    return gate;
  };

  const counts = async () => ({
    sessions: await t.prisma.analysisSession.count(),
    messages: await t.prisma.analysisMessage.count(),
    resultSets: await t.prisma.resultSet.count(),
    rows: await t.prisma.resultRow.count(),
  });
  const empty = { sessions: 0, messages: 0, resultSets: 0, rows: 0 };

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
  });

  describe("session end during a turn", () => {
    it("signs out promptly while the model is working, and discards the late outcome", async () => {
      const token = await signIn();
      await send(token, "The previous calendar year");
      const gate = holdModel();
      const turn = start(send(token, "Show the lowest spenders"));
      await gate.entered;

      const began = Date.now();
      expect((await signOut(token)).status).toBe(204);
      expect(Date.now() - began).toBeLessThan(2000);
      expect(await counts()).toEqual(empty);

      gate.open();
      expect((await turn).status).toBe(401);
      expect(await counts()).toEqual(empty);
    });

    it("signs out promptly while the data source is working", async () => {
      const token = await signIn();
      const gate = holdFetch();
      const turn = start(send(token, "The previous calendar year"));
      await gate.entered;

      expect((await signOut(token)).status).toBe(204);
      expect(await counts()).toEqual(empty);

      gate.open();
      expect((await turn).status).toBe(401);
      expect(await counts()).toEqual(empty);
    });

    it("lets the user sign in elsewhere during a turn; the new session starts empty", async () => {
      const first = await signIn();
      await send(first, "The previous calendar year");
      const gate = holdModel();
      const turn = start(send(first, "Show the lowest spenders"));
      await gate.entered;

      const began = Date.now();
      const second = await signIn();
      expect(Date.now() - began).toBeLessThan(2000);
      expect((await getState(first)).status).toBe(401);

      gate.open();
      expect((await turn).status).toBe(401);
      const state = await getState(second);
      expect(state.body).toMatchObject({ messages: [], activeResult: null, turnInProgress: false });
      expect(await t.prisma.resultSet.count()).toBe(0);
    });

    it("lets the sweeper end an idle session during a turn", async () => {
      const token = await signIn();
      await send(token, "The previous calendar year");
      const gate = holdModel();
      const turn = start(send(token, "Show the lowest spenders"));
      await gate.entered;

      t.clock.advance(IDLE_TIMEOUT_MS + 1000);
      await t.app.get(SessionSweeper).sweep();
      expect(await counts()).toEqual(empty);
      expect(await t.prisma.authSession.count()).toBe(0);

      gate.open();
      expect((await turn).status).toBe(401);
      expect(await counts()).toEqual(empty);
    });
  });

  describe("refresh during a turn", () => {
    it("returns the state promptly during a first turn and reports the turn in progress", async () => {
      const token = await signIn();
      const gate = holdModel();
      const turn = start(send(token, "The previous calendar year"));
      await gate.entered;

      const began = Date.now();
      const during = await getState(token);
      expect(Date.now() - began).toBeLessThan(1000);
      expect(during.status).toBe(200);
      expect(during.body).toMatchObject({ messages: [], activeResult: null, turnInProgress: true });

      gate.open();
      expect((await turn).status).toBe(200);
      const after = await getState(token);
      expect(after.body.turnInProgress).toBe(false);
      expect(after.body.messages).toHaveLength(2);
    });
  });

  describe("one turn at a time", () => {
    it("refuses a second message and a Switch click while a turn runs, changing nothing", async () => {
      const token = await signIn();
      await send(token, "The previous calendar year");
      await send(token, "Show product sales instead");
      const gate = holdModel();
      const turn = start(send(token, "Show the lowest spenders"));
      await gate.entered;

      const second = await send(token, "Show this as a table");
      expect(second.status).toBe(409);
      expect(second.body).toMatchObject({ code: "turn_in_progress" });
      const button = await choose(token, "switch");
      expect(button.status).toBe(409);
      expect(button.body).toMatchObject({ code: "turn_in_progress" });

      gate.open();
      expect((await turn).status).toBe(200);
      const state = (await getState(token)).body;
      expect(state.messages).toHaveLength(6);
      expect(state.activeResult.capability).toBe("customer_spending");
      expect(state.activeResult.view.view).toBe("bar");
    });

    it("discards a turn that finishes after the deadline even if nobody took over, and frees the session (review round 2)", async () => {
      const token = await signIn();
      const gate = holdModel();
      const late = start(send(token, "The previous calendar year"));
      await gate.entered;

      t.clock.advance(TURN_DEADLINE_MS + 1000);
      // The server already reports the turn as over.
      expect((await getState(token)).body.turnInProgress).toBe(false);

      gate.open();
      const response = await late;
      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ code: "turn_superseded" });
      expect(await counts()).toMatchObject({ messages: 0, resultSets: 0 });
      const session = await t.prisma.analysisSession.findFirstOrThrow();
      expect(session.turnId).toBeNull();
    });

    it("lets a new turn take over a marker older than the deadline; the old outcome is discarded", async () => {
      const token = await signIn();
      const gate = holdModel();
      const stale = start(send(token, "The previous calendar year"));
      await gate.entered;

      t.clock.advance(TURN_DEADLINE_MS + 1000);
      const fresh = await send(token, "What's the weather today?");
      expect(fresh.status).toBe(200);

      gate.open();
      const dropped = await stale;
      expect(dropped.status).toBe(409);
      // Review S4: the dropped turn says so, rather than "still answering".
      expect(dropped.body).toMatchObject({ code: "turn_superseded" });
      const state = (await getState(token)).body;
      expect(state.messages.map((m: { text: string }) => m.text)[0]).toBe(
        "What's the weather today?",
      );
      expect(state.messages).toHaveLength(2);
      expect(state.activeResult).toBeNull();
      expect(state.turnInProgress).toBe(false);
    });

    it("keeps the conversation consistent under simultaneous messages", async () => {
      const token = await signIn();
      await send(token, "The previous calendar year");
      const responses = await Promise.all([
        send(token, "Show the lowest spenders"),
        send(token, "Show this as a table"),
        send(token, "Only customers who spent over $500"),
      ]);
      const statuses = responses.map((r) => r.status);
      for (const status of statuses) expect([200, 409]).toContain(status);
      const accepted = statuses.filter((s) => s === 200).length;
      expect(accepted).toBeGreaterThanOrEqual(1);
      const state = (await getState(token)).body;
      expect(state.messages.map((m: { seq: number }) => m.seq)).toEqual(
        Array.from({ length: 2 + 2 * accepted }, (_, i) => i + 1),
      );
      expect(state.turnInProgress).toBe(false);
    });
  });

  describe("every failure path frees the session for the next turn", () => {
    const expectFree = async (token: string) => {
      expect((await getState(token)).body.turnInProgress).toBe(false);
      expect((await send(token, "What's the weather today?")).status).toBe(200);
    };

    it("after a model failure", async () => {
      const token = await signIn();
      vi.spyOn(t.app.get(LlmClient), "decide").mockRejectedValueOnce(new Error("down"));
      expect((await send(token, "The previous calendar year")).status).toBe(200);
      await expectFree(token);
    });

    it("after an invalid decision", async () => {
      const token = await signIn();
      vi.spyOn(t.app.get(LlmClient), "decide").mockResolvedValueOnce({ nonsense: true });
      expect((await send(token, "The previous calendar year")).status).toBe(200);
      await expectFree(token);
    });

    it("after a retrieval failure", async () => {
      const token = await signIn();
      vi.spyOn(t.app.get(DataSource), "fetch").mockRejectedValueOnce(new Error("down"));
      expect((await send(token, "The previous calendar year")).status).toBe(200);
      await expectFree(token);
    });

    it("after a result over the row cap", async () => {
      const token = await signIn();
      const tooMany = Array.from({ length: CAPABILITIES.customer_spending.rowCap + 1 }, (_, i) => ({
        customer_id: String(i),
        customer_name: "x",
        total_spend: 1,
        order_count: 1,
        avg_order_value: 1,
      }));
      vi.spyOn(t.app.get(DataSource), "fetch").mockResolvedValueOnce(tooMany);
      expect((await send(token, "The previous calendar year")).status).toBe(200);
      expect(await t.prisma.resultSet.count()).toBe(0);
      await expectFree(token);
    });

    it("after an unexpected error while saving the outcome", async () => {
      const token = await signIn();
      vi.spyOn(t.app.get(ResultEngine), "view").mockRejectedValueOnce(new Error("boom"));
      expect((await send(token, "The previous calendar year")).status).toBe(500);
      expect(await t.prisma.resultSet.count()).toBe(0);
      expect(await t.prisma.analysisMessage.count()).toBe(0);
      await expectFree(token);
    });
  });
});
