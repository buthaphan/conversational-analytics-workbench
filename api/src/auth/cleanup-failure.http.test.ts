import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionCleanupRegistry } from "../sessions/session-cleanup";
import { SessionSweeper } from "../sessions/session.sweeper";
import {
  TEST_ORIGIN,
  type TestApp,
  createTestApp,
  createUser,
  resetDatabase,
  sessionCookie,
} from "../test/app";

const credentials = { email: "user@example.test", password: "right-password" };

describe("sign-in while the previous session's cleanup keeps failing (AC-5, AC-9, review S2)", () => {
  let t: TestApp;
  let cleanupFails: boolean;
  const signIn = () =>
    request(t.app.getHttpServer())
      .post("/api/auth/sign-in")
      .set("Origin", TEST_ORIGIN)
      .send(credentials);
  const session = (token: string) =>
    request(t.app.getHttpServer()).get("/api/auth/session").set("Cookie", `cawb_session=${token}`);

  beforeAll(async () => {
    // A separate app instance, because the failing cleanup step stays registered.
    t = await createTestApp();
    t.app.get(SessionCleanupRegistry).register(async () => {
      if (cleanupFails) throw new Error("cleanup failed");
    });
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    await createUser(t.prisma, credentials.email, credentials.password);
    cleanupFails = false;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("refuses the new sign-in with a generic 500 and never leaves two sessions", async () => {
    const first = sessionCookie(await signIn())!;
    cleanupFails = true;

    const second = await signIn();
    expect(second.status).toBe(500);
    expect(second.body).toEqual({ statusCode: 500, message: "Internal server error" });
    expect(sessionCookie(second)).toBeUndefined();
    expect((await session(first)).status).toBe(401);
    expect(await t.prisma.authSession.count()).toBe(1);
    const row = await t.prisma.authSession.findFirstOrThrow();
    expect(row.endReason).toBe("replaced");
  });

  it("allows sign-in again once the sweep has finished the cleanup", async () => {
    sessionCookie(await signIn());
    cleanupFails = true;
    expect((await signIn()).status).toBe(500);

    cleanupFails = false;
    await t.app.get(SessionSweeper).sweep();
    expect(await t.prisma.authSession.count()).toBe(0);
    const again = await signIn();
    expect(again.status).toBe(200);
    expect((await session(sessionCookie(again)!)).status).toBe(200);
  });
});
