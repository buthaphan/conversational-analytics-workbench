import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TEST_ORIGIN, type TestApp, createTestApp, createUser, resetDatabase } from "../test/app";

const minute = 60 * 1000;
// Unknown emails run a full-strength dummy scrypt check (~0.25 s each), so tests that make many such
// attempts need more than Vitest's 5-second default.
const MANY_ATTEMPTS_TIMEOUT_MS = 30_000;
const LIMITED = "Too many sign-in attempts. Try again later.";
const right = { email: "user@example.test", password: "right-password" };
const wrong = { email: "user@example.test", password: "wrong" };

describe("sign-in rate limiting (AC-10)", () => {
  let t: TestApp;
  const signIn = (body: object, app = t) =>
    request(app.app.getHttpServer())
      .post("/api/auth/sign-in")
      .set("Origin", TEST_ORIGIN)
      .send(body);
  const fail = async (times: number, body: object = wrong) => {
    for (let i = 0; i < times; i++) expect((await signIn(body)).status).toBe(401);
  };

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    await createUser(t.prisma, right.email, right.password);
  });

  it("allows sign-in after 4 failures", async () => {
    await fail(4);
    expect((await signIn(right)).status).toBe(200);
  });

  it("blocks the email after 5 failures in 15 minutes, even with the correct password", async () => {
    await fail(5);
    const response = await signIn(right);
    expect(response.status).toBe(429);
    expect(response.body).toEqual({ message: LIMITED });
    expect(response.headers["retry-after"]).toBe("900");
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("counts failures for the same email regardless of letter case and spacing", async () => {
    await fail(3);
    await fail(2, { email: "  USER@example.test ", password: "wrong" });
    expect((await signIn(right)).status).toBe(429);
  });

  it(
    "counts failures for unknown emails too",
    async () => {
      await fail(5, { email: "nobody@example.test", password: "wrong" });
      expect((await signIn({ email: "nobody@example.test", password: "x" })).status).toBe(429);
    },
    MANY_ATTEMPTS_TIMEOUT_MS,
  );

  it("lifts the block once the 15-minute window has passed", async () => {
    await fail(5);
    t.clock.advance(10 * minute);
    const blocked = await signIn(right);
    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toBe("300");
    t.clock.advance(5 * minute);
    expect((await signIn(right)).status).toBe(200);
  });

  it("clears the email's failures after a successful sign-in", async () => {
    await fail(4);
    expect((await signIn(right)).status).toBe(200);
    await fail(4);
    expect((await signIn(right)).status).toBe(200);
  });

  it("does not let one email's failures block another email", async () => {
    await createUser(t.prisma, "other@example.test", "other-password");
    await fail(5);
    expect((await signIn({ email: "other@example.test", password: "other-password" })).status).toBe(
      200,
    );
  });

  it(
    "blocks a client IP after 20 failures in 15 minutes across emails",
    async () => {
      for (let i = 0; i < 20; i++) {
        expect((await signIn({ email: `guess${i}@example.test`, password: "x" })).status).toBe(401);
      }
      const response = await signIn(right);
      expect(response.status).toBe(429);
      expect(response.body).toEqual({ message: LIMITED });
    },
    MANY_ATTEMPTS_TIMEOUT_MS,
  );

  it("keeps the limit after the API restarts", async () => {
    await fail(5);
    const restarted = await createTestApp();
    restarted.clock.advance(t.clock.now().getTime() - restarted.clock.now().getTime());
    try {
      expect((await signIn(right, restarted)).status).toBe(429);
    } finally {
      await restarted.close();
    }
  });
});
