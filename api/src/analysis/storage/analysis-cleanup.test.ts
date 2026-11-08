import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionCleanupRegistry } from "../../sessions/session-cleanup";
import { SessionSweeper } from "../../sessions/session.sweeper";
import { SessionStore } from "../../sessions/session.store";
import { type TestApp, createTestApp, createUser, resetDatabase } from "../../test/app";
import { CAPABILITIES } from "../capabilities/registry";
import { ANALYSIS_CLEANUP_STEP_NAME } from "./analysis-cleanup";

const minute = 60 * 1000;

describe("analysis data is deleted when the login session ends (AC-1)", () => {
  let t: TestApp;
  let store: SessionStore;

  beforeAll(async () => {
    t = await createTestApp();
    store = t.app.get(SessionStore);
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
  });

  async function signedInWithAnalysis(rows = 3) {
    const user = await createUser(t.prisma, "user@example.test", "pw");
    const { sessionId, token } = await store.create(user.id);
    const analysis = await t.prisma.analysisSession.create({
      data: { authSessionId: sessionId, userId: user.id },
    });
    const resultSet = await t.prisma.resultSet.create({
      data: {
        analysisSessionId: analysis.id,
        capability: "customer_spending",
        scope: { start_date: "2025-01-01", end_date: "2026-01-01" },
        rowCount: rows,
      },
    });
    for (let start = 0; start < rows; start += 5000) {
      await t.prisma.resultRow.createMany({
        data: Array.from({ length: Math.min(5000, rows - start) }, (_, i) => ({
          resultSetId: resultSet.id,
          rowIndex: start + i,
          data: { customer_id: `c${start + i}`, total_spend: start + i },
        })),
      });
    }
    await t.prisma.analysisMessage.create({
      data: { analysisSessionId: analysis.id, seq: 1, role: "user", text: "hi" },
    });
    return { user, sessionId, token };
  }

  async function analysisLeft() {
    return (
      (await t.prisma.analysisSession.count()) +
      (await t.prisma.analysisMessage.count()) +
      (await t.prisma.resultSet.count()) +
      (await t.prisma.resultRow.count())
    );
  }

  it("registers a named cleanup step with the session cleanup point", () => {
    expect(t.app.get(SessionCleanupRegistry).registeredNames()).toContain(
      ANALYSIS_CLEANUP_STEP_NAME,
    );
  });

  it("deletes analysis data on sign-out", async () => {
    const { sessionId } = await signedInWithAnalysis();
    await store.end(sessionId, "sign_out");
    expect(await analysisLeft()).toBe(0);
  });

  it("deletes analysis data when a new sign-in replaces the session", async () => {
    const { user } = await signedInWithAnalysis();
    await store.create(user.id);
    expect(await analysisLeft()).toBe(0);
  });

  it("deletes analysis data when the session expires through inactivity", async () => {
    await signedInWithAnalysis();
    t.clock.advance(10 * minute);
    await t.app.get(SessionSweeper).sweep();
    expect(await analysisLeft()).toBe(0);
  });

  it("deletes analysis data when the session reaches its 12-hour maximum", async () => {
    const { token } = await signedInWithAnalysis();
    for (let elapsed = 0; elapsed < 12 * 60 * minute; elapsed += 5 * minute) {
      t.clock.advance(5 * minute);
      await store.authenticate(token);
    }
    expect(await analysisLeft()).toBe(0);
  });

  it("runs inside the session-end transaction: if a later step fails, the analysis data is kept and retried", async () => {
    // A separate app, because the failing step stays registered for the app's lifetime.
    const failingApp = await createTestApp();
    try {
      const user = await createUser(failingApp.prisma, "user@example.test", "pw");
      const failingStore = failingApp.app.get(SessionStore);
      const { sessionId } = await failingStore.create(user.id);
      await failingApp.prisma.analysisSession.create({
        data: { authSessionId: sessionId, userId: user.id },
      });
      failingApp.app.get(SessionCleanupRegistry).register(async () => {
        throw new Error("later cleanup step failed");
      }, "test-failing-step");
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      await failingStore.end(sessionId, "sign_out");
      error.mockRestore();
      // The analysis delete ran first in the same transaction and was rolled back with it.
      expect(await failingApp.prisma.analysisSession.count()).toBe(1);
      expect((await failingApp.prisma.authSession.findFirstOrThrow()).endedAt).not.toBeNull();
    } finally {
      await failingApp.close();
    }
  });

  it("finishes well inside the 5-second transaction timeout for a large result", async () => {
    const { sessionId } = await signedInWithAnalysis(20_000);
    const started = Date.now();
    await store.end(sessionId, "sign_out");
    expect(Date.now() - started).toBeLessThan(2500);
    expect(await analysisLeft()).toBe(0);
  }, 60_000);

  it("cleans up a result at the row cap inside the 5-second transaction (TASK-004 AC-8)", async () => {
    const cap = Math.max(...Object.values(CAPABILITIES).map((c) => c.rowCap));
    const { sessionId } = await signedInWithAnalysis(cap);
    const started = Date.now();
    await store.end(sessionId, "sign_out");
    const elapsed = Date.now() - started;
    console.log(`Cleaned up ${cap} rows in ${elapsed} ms.`);
    expect(elapsed).toBeLessThan(5000);
    expect(await analysisLeft()).toBe(0);
  }, 120_000);
});
