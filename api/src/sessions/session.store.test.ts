import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../config/config";
import { createTestPrisma, resetDatabase } from "../test/database";
import { FakeClock } from "../test/fake-clock";
import { type SessionCleanupContext, SessionCleanupRegistry } from "./session-cleanup";
import { SessionStore, hashToken } from "./session.store";

const prisma = createTestPrisma();
const minute = 60 * 1000;
const config = loadConfig({ DATABASE_URL: "postgresql://unused", APP_ORIGIN: "http://localhost" });

describe("SessionStore (AC-6, AC-9, AC-11)", () => {
  let clock: FakeClock;
  let cleanup: SessionCleanupRegistry;
  let store: SessionStore;
  let calls: SessionCleanupContext[];
  let userId: string;

  beforeEach(async () => {
    await resetDatabase(prisma);
    clock = new FakeClock();
    cleanup = new SessionCleanupRegistry();
    calls = [];
    cleanup.register(async (context) => {
      calls.push(context);
    });
    store = new SessionStore(prisma, config, clock, cleanup);
    userId = (await prisma.user.create({ data: { email: "a@example.test", passwordHash: "x" } }))
      .id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("creating a session", () => {
    it("returns a long random token and stores only its SHA-256 hash", async () => {
      const { token, sessionId } = await store.create(userId);
      expect(Buffer.from(token, "base64url")).toHaveLength(32);
      const row = await prisma.authSession.findUniqueOrThrow({ where: { id: sessionId } });
      expect(row.tokenHash).toBe(hashToken(token));
      expect(row.tokenHash).not.toContain(token);
    });

    it("does not store the raw token in any column of any table", async () => {
      const { token } = await store.create(userId);
      const hits = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT
           (SELECT count(*) FROM users u WHERE u::text LIKE '%' || $1 || '%') +
           (SELECT count(*) FROM auth_sessions s WHERE s::text LIKE '%' || $1 || '%') +
           (SELECT count(*) FROM sign_in_attempts a WHERE a::text LIKE '%' || $1 || '%') AS count`,
        token,
      );
      expect(Number(hits[0]?.count)).toBe(0);
    });

    it("sets the 12-hour absolute expiry from the sign-in time", async () => {
      const { sessionId } = await store.create(userId);
      const row = await prisma.authSession.findUniqueOrThrow({ where: { id: sessionId } });
      expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBe(12 * 60 * minute);
      expect(row.lastActivityAt).toEqual(clock.now());
    });
  });

  describe("authenticating a token", () => {
    it("returns the user and records the activity", async () => {
      const { token, sessionId } = await store.create(userId);
      clock.advance(5 * minute);
      const result = await store.authenticate(token);
      expect(result).toMatchObject({ sessionId, user: { id: userId, email: "a@example.test" } });
      const row = await prisma.authSession.findUniqueOrThrow({ where: { id: sessionId } });
      expect(row.lastActivityAt).toEqual(clock.now());
    });

    it.each([
      ["unknown token", "not-a-real-token"],
      ["empty token", ""],
    ])("returns null for an %s", async (_, token) => {
      await store.create(userId);
      expect(await store.authenticate(token)).toBeNull();
    });

    it("accepts activity up to just under 10 minutes apart, extending the session each time", async () => {
      const { token } = await store.create(userId);
      for (let i = 0; i < 3; i++) {
        clock.advance(10 * minute - 1000);
        expect(await store.authenticate(token)).not.toBeNull();
      }
    });

    it("ends the session at 10 minutes without activity (reason idle)", async () => {
      const { token, sessionId } = await store.create(userId);
      clock.advance(10 * minute);
      expect(await store.authenticate(token)).toBeNull();
      expect(calls).toEqual([{ sessionId, userId, reason: "idle" }]);
      expect(await prisma.authSession.count()).toBe(0);
    });

    it("ends the session 12 hours after sign-in even with continuous activity (reason max_age)", async () => {
      const { token, sessionId } = await store.create(userId);
      for (let elapsed = 0; elapsed < 12 * 60 * minute - 5 * minute; elapsed += 5 * minute) {
        clock.advance(5 * minute);
        expect(await store.authenticate(token)).not.toBeNull();
      }
      clock.advance(5 * minute);
      expect(await store.authenticate(token)).toBeNull();
      expect(calls).toEqual([{ sessionId, userId, reason: "max_age" }]);
    });
  });

  describe("ending a session", () => {
    it("runs every cleanup step with the session, user, and reason, then deletes the session", async () => {
      const second: SessionCleanupContext[] = [];
      cleanup.register(async (context) => {
        second.push(context);
      });
      const { token, sessionId } = await store.create(userId);
      await store.end(sessionId, "sign_out");
      expect(calls).toEqual([{ sessionId, userId, reason: "sign_out" }]);
      expect(second).toEqual(calls);
      expect(await prisma.authSession.count()).toBe(0);
      expect(await store.authenticate(token)).toBeNull();
    });

    it("replaces the previous session when the user signs in again (reason replaced)", async () => {
      const first = await store.create(userId);
      const second = await store.create(userId);
      expect(calls).toEqual([{ sessionId: first.sessionId, userId, reason: "replaced" }]);
      expect(await store.authenticate(first.token)).toBeNull();
      expect(await store.authenticate(second.token)).not.toBeNull();
      expect(await prisma.authSession.count()).toBe(1);
    });

    it("keeps the token rejected and the row marked ended when a cleanup step fails", async () => {
      cleanup.register(async () => {
        throw new Error("cleanup failed");
      });
      const { token, sessionId } = await store.create(userId);
      await store.end(sessionId, "sign_out");
      expect(await store.authenticate(token)).toBeNull();
      const row = await prisma.authSession.findUniqueOrThrow({ where: { id: sessionId } });
      expect(row.endedAt).toEqual(clock.now());
      expect(row.endReason).toBe("sign_out");
    });

    it("runs cleanup steps in the same transaction as the delete", async () => {
      cleanup.register(async (_context, tx) => {
        await tx.signInAttempt.create({
          data: { email: "written-by-cleanup", clientIp: "-", attemptedAt: new Date() },
        });
        throw new Error("cleanup failed after writing");
      });
      const { sessionId } = await store.create(userId);
      await store.end(sessionId, "sign_out");
      expect(await prisma.signInAttempt.count()).toBe(0);
    });

    it("runs cleanup exactly once when many requests end the same session at once", async () => {
      for (let round = 0; round < 5; round++) {
        calls.length = 0;
        const { sessionId } = await store.create(userId);
        calls.length = 0; // ignore the "replaced" cleanup of the previous round's session
        const finished = await Promise.all(
          Array.from({ length: 10 }, () =>
            store.end(sessionId, "sign_out").then(() => store.finishEnded(sessionId)),
          ),
        );
        expect(finished.every(Boolean)).toBe(true);
        expect(calls).toHaveLength(1);
        expect(await prisma.authSession.count()).toBe(0);
      }
    });

    it("is safe to call for a session that no longer exists", async () => {
      const { sessionId } = await store.create(userId);
      await store.end(sessionId, "sign_out");
      await expect(store.end(sessionId, "sign_out")).resolves.toBeUndefined();
      expect(calls).toHaveLength(1);
    });
  });
});
