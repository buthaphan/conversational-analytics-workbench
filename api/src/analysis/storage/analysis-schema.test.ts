import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestPrisma, resetDatabase } from "../../test/database";

const prisma = createTestPrisma();
const hour = 60 * 60 * 1000;

async function userWithSession(email: string) {
  const user = await prisma.user.create({ data: { email, passwordHash: "x" } });
  const now = new Date();
  const authSession = await prisma.authSession.create({
    data: {
      userId: user.id,
      tokenHash: `hash-${email}`,
      createdAt: now,
      lastActivityAt: now,
      expiresAt: new Date(now.getTime() + 12 * hour),
    },
  });
  return { user, authSession };
}

async function analysisWithResult(email: string) {
  const { user, authSession } = await userWithSession(email);
  const session = await prisma.analysisSession.create({
    data: { authSessionId: authSession.id, userId: user.id },
  });
  const resultSet = await prisma.resultSet.create({
    data: {
      analysisSessionId: session.id,
      capability: "customer_spending",
      scope: { start_date: "2025-01-01", end_date: "2026-01-01" },
      rowCount: 2,
      rows: {
        create: [
          { rowIndex: 0, data: { customer_id: "c1", total_spend: 10 } },
          { rowIndex: 1, data: { customer_id: "c2", total_spend: 20 } },
        ],
      },
    },
  });
  await prisma.analysisSession.update({
    where: { id: session.id },
    data: { activeResultSetId: resultSet.id },
  });
  await prisma.analysisMessage.create({
    data: { analysisSessionId: session.id, seq: 1, role: "user", text: "hello" },
  });
  return { user, authSession, session, resultSet };
}

async function analysisRowCounts() {
  return {
    sessions: await prisma.analysisSession.count(),
    messages: await prisma.analysisMessage.count(),
    resultSets: await prisma.resultSet.count(),
    rows: await prisma.resultRow.count(),
  };
}

describe("analysis storage (AC-1)", () => {
  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("allows one analysis session per login session", async () => {
    const { user, authSession } = await userWithSession("a@example.test");
    await prisma.analysisSession.create({
      data: { authSessionId: authSession.id, userId: user.id },
    });
    await expect(
      prisma.analysisSession.create({ data: { authSessionId: authSession.id, userId: user.id } }),
    ).rejects.toThrow();
  });

  it("stores view settings and pending action as JSON, with empty view settings by default", async () => {
    const { user, authSession } = await userWithSession("a@example.test");
    const session = await prisma.analysisSession.create({
      data: { authSessionId: authSession.id, userId: user.id },
    });
    expect(session.viewSettings).toEqual({});
    expect(session.pendingAction).toBeNull();
    expect(session.activeResultSetId).toBeNull();
  });

  it("keeps result rows unique by position within a result set", async () => {
    const { resultSet } = await analysisWithResult("a@example.test");
    await expect(
      prisma.resultRow.create({ data: { resultSetId: resultSet.id, rowIndex: 0, data: {} } }),
    ).rejects.toThrow();
  });

  it("deletes a result set's rows with it and clears the session's active pointer", async () => {
    const { session, resultSet } = await analysisWithResult("a@example.test");
    await prisma.resultSet.delete({ where: { id: resultSet.id } });
    expect(await prisma.resultRow.count()).toBe(0);
    const after = await prisma.analysisSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(after.activeResultSetId).toBeNull();
  });

  it("deletes all analysis data when the login session row is deleted", async () => {
    const { authSession } = await analysisWithResult("a@example.test");
    await analysisWithResult("b@example.test");
    await prisma.authSession.delete({ where: { id: authSession.id } });
    expect(await analysisRowCounts()).toEqual({ sessions: 1, messages: 1, resultSets: 1, rows: 2 });
  });

  it("deletes all analysis data when the user is deleted (TASK-001 handover S1)", async () => {
    const { user } = await analysisWithResult("a@example.test");
    await prisma.user.delete({ where: { id: user.id } });
    expect(await analysisRowCounts()).toEqual({ sessions: 0, messages: 0, resultSets: 0, rows: 0 });
  });
});
