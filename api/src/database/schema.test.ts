import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestPrisma, resetDatabase } from "../test/database";

const prisma = createTestPrisma();
const hour = 60 * 60 * 1000;

function sessionFor(userId: string, tokenHash: string) {
  const now = new Date();
  return {
    userId,
    tokenHash,
    createdAt: now,
    lastActivityAt: now,
    expiresAt: new Date(now.getTime() + 12 * hour),
  };
}

describe("database constraints (AC-2)", () => {
  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects a second user with the same email", async () => {
    await prisma.user.create({ data: { email: "a@example.test", passwordHash: "x" } });
    await expect(
      prisma.user.create({ data: { email: "a@example.test", passwordHash: "y" } }),
    ).rejects.toThrow();
  });

  it("rejects an email that is not lowercase, so uniqueness is case-insensitive", async () => {
    await expect(
      prisma.user.create({ data: { email: "A@Example.test", passwordHash: "x" } }),
    ).rejects.toThrow();
  });

  it("allows at most one session row per user", async () => {
    const user = await prisma.user.create({ data: { email: "a@example.test", passwordHash: "x" } });
    await prisma.authSession.create({ data: sessionFor(user.id, "hash-1") });
    await expect(
      prisma.authSession.create({ data: sessionFor(user.id, "hash-2") }),
    ).rejects.toThrow();
  });

  it("rejects two sessions with the same token hash", async () => {
    const a = await prisma.user.create({ data: { email: "a@example.test", passwordHash: "x" } });
    const b = await prisma.user.create({ data: { email: "b@example.test", passwordHash: "x" } });
    await prisma.authSession.create({ data: sessionFor(a.id, "same") });
    await expect(prisma.authSession.create({ data: sessionFor(b.id, "same") })).rejects.toThrow();
  });

  it("deletes a user's session when the user is deleted", async () => {
    const user = await prisma.user.create({ data: { email: "a@example.test", passwordHash: "x" } });
    await prisma.authSession.create({ data: sessionFor(user.id, "hash-1") });
    await prisma.user.delete({ where: { id: user.id } });
    expect(await prisma.authSession.count()).toBe(0);
  });

  it("stores sign-in attempts with email, client IP, and time", async () => {
    const attemptedAt = new Date();
    await prisma.signInAttempt.create({
      data: { email: "a@example.test", clientIp: "127.0.0.1", attemptedAt },
    });
    const [row] = await prisma.signInAttempt.findMany();
    expect(row).toMatchObject({ email: "a@example.test", clientIp: "127.0.0.1", attemptedAt });
  });
});
