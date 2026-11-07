import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../config/config";
import { createTestPrisma, resetDatabase } from "../test/database";
import { FakeClock } from "../test/fake-clock";
import { type SessionCleanupContext, SessionCleanupRegistry } from "./session-cleanup";
import { SessionStore } from "./session.store";
import { SWEEP_INTERVAL_MS, SessionSweeper } from "./session.sweeper";

const prisma = createTestPrisma();
const minute = 60 * 1000;
const hour = 60 * minute;

describe("SessionSweeper (AC-9)", () => {
  let clock: FakeClock;
  let calls: SessionCleanupContext[];
  let failCleanup: boolean;
  let store: SessionStore;
  let sweeper: SessionSweeper;
  let userId: string;

  const build = (nodeEnv: "test" | "development") => {
    const config = loadConfig({
      DATABASE_URL: "postgresql://unused",
      APP_ORIGIN: "http://localhost",
      NODE_ENV: nodeEnv,
    });
    const cleanup = new SessionCleanupRegistry();
    cleanup.register(async (context) => {
      if (failCleanup) throw new Error("cleanup failed");
      calls.push(context);
    });
    store = new SessionStore(prisma, config, clock, cleanup);
    sweeper = new SessionSweeper(prisma, config, clock, store);
  };

  beforeEach(async () => {
    await resetDatabase(prisma);
    clock = new FakeClock();
    calls = [];
    failCleanup = false;
    build("test");
    userId = (await prisma.user.create({ data: { email: "a@example.test", passwordHash: "x" } }))
      .id;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("ends a session idle for 10 minutes (reason idle) and deletes it", async () => {
    const { sessionId } = await store.create(userId);
    clock.advance(10 * minute);
    await sweeper.sweep();
    expect(calls).toEqual([{ sessionId, userId, reason: "idle" }]);
    expect(await prisma.authSession.count()).toBe(0);
  });

  it("leaves an active session alone", async () => {
    const { token } = await store.create(userId);
    clock.advance(9 * minute);
    await sweeper.sweep();
    expect(calls).toEqual([]);
    expect(await store.authenticate(token)).not.toBeNull();
  });

  it("ends a session past 12 hours (reason max_age) even if it was just active", async () => {
    const { token, sessionId } = await store.create(userId);
    for (let elapsed = 0; elapsed < 12 * hour - 5 * minute; elapsed += 5 * minute) {
      clock.advance(5 * minute);
      await store.authenticate(token);
    }
    clock.advance(5 * minute);
    await sweeper.sweep();
    expect(calls).toEqual([{ sessionId, userId, reason: "max_age" }]);
  });

  it("retries a failed cleanup on the next sweep, keeping the original reason", async () => {
    const { token, sessionId } = await store.create(userId);
    failCleanup = true;
    await store.end(sessionId, "sign_out");
    await sweeper.sweep();
    expect(await prisma.authSession.count()).toBe(1);
    expect(await store.authenticate(token)).toBeNull();

    failCleanup = false;
    await sweeper.sweep();
    expect(calls).toEqual([{ sessionId, userId, reason: "sign_out" }]);
    expect(await prisma.authSession.count()).toBe(0);
  });

  it("deletes sign-in attempts older than 24 hours and keeps newer ones", async () => {
    const now = clock.now().getTime();
    await prisma.signInAttempt.createMany({
      data: [
        { email: "old", clientIp: "-", attemptedAt: new Date(now - 24 * hour - 1000) },
        { email: "new", clientIp: "-", attemptedAt: new Date(now - 23 * hour) },
      ],
    });
    await sweeper.sweep();
    expect((await prisma.signInAttempt.findMany()).map((a) => a.email)).toEqual(["new"]);
  });

  describe("schedule", () => {
    it("sweeps once on start, then every 60 seconds, and stops on shutdown", async () => {
      build("development");
      const sweep = vi.spyOn(sweeper, "sweep").mockResolvedValue();
      const setTimer = vi.spyOn(globalThis, "setInterval");
      const clearTimer = vi.spyOn(globalThis, "clearInterval");
      await sweeper.onApplicationBootstrap();
      expect(sweep).toHaveBeenCalledTimes(1);
      expect(SWEEP_INTERVAL_MS).toBe(60_000);
      expect(setTimer).toHaveBeenCalledWith(expect.any(Function), SWEEP_INTERVAL_MS);
      sweeper.onApplicationShutdown();
      expect(clearTimer).toHaveBeenCalledTimes(1);
    });

    it("does not schedule sweeps in automated tests (they call sweep directly)", async () => {
      const setTimer = vi.spyOn(globalThis, "setInterval");
      await sweeper.onApplicationBootstrap();
      expect(setTimer).not.toHaveBeenCalled();
    });
  });
});
