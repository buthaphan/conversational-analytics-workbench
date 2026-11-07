import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyPassword } from "../auth/password";
import { createTestPrisma, resetDatabase } from "../test/database";
import {
  DEV_ACCOUNT_EMAIL,
  DEV_ACCOUNT_PASSWORD,
  SeedRefusedError,
  seedDevAccount,
} from "./dev-seed";
import { runSeed } from "./run-seed";

const prisma = createTestPrisma();
const allowed = { NODE_ENV: "development", ALLOW_DEV_SEED: "true" };

describe("development seed (AC-12)", () => {
  beforeEach(async () => {
    await resetDatabase(prisma);
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("is the documented local account", () => {
    expect(DEV_ACCOUNT_EMAIL).toBe("user@example.test");
    expect(DEV_ACCOUNT_PASSWORD).toBe("123456");
  });

  it.each([
    ["development", { NODE_ENV: "development", ALLOW_DEV_SEED: "true" }],
    ["test", { NODE_ENV: "test", ALLOW_DEV_SEED: "true" }],
  ])("creates the account with a scrypt hash in %s", async (_, env) => {
    await seedDevAccount(prisma, env);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: DEV_ACCOUNT_EMAIL } });
    expect(user.passwordHash).toMatch(/^scrypt\$131072\$8\$1\$/);
    expect(user.passwordHash).not.toContain(DEV_ACCOUNT_PASSWORD);
    expect(await verifyPassword(DEV_ACCOUNT_PASSWORD, user.passwordHash)).toBe(true);
  });

  it("is idempotent: running it twice leaves one account that still signs in", async () => {
    await seedDevAccount(prisma, allowed);
    await seedDevAccount(prisma, allowed);
    const users = await prisma.user.findMany();
    expect(users).toHaveLength(1);
    expect(await verifyPassword(DEV_ACCOUNT_PASSWORD, users[0]!.passwordHash)).toBe(true);
  });

  it.each([
    ["production", { NODE_ENV: "production", ALLOW_DEV_SEED: "true" }],
    ["NODE_ENV missing", { ALLOW_DEV_SEED: "true" }],
    ["an unknown NODE_ENV", { NODE_ENV: "staging", ALLOW_DEV_SEED: "true" }],
    ["ALLOW_DEV_SEED missing", { NODE_ENV: "development" }],
    ["ALLOW_DEV_SEED=false", { NODE_ENV: "development", ALLOW_DEV_SEED: "false" }],
    [
      "ALLOW_DEV_SEED=TRUE (only lowercase true)",
      { NODE_ENV: "development", ALLOW_DEV_SEED: "TRUE" },
    ],
  ])("refuses in %s and writes nothing", async (_, env) => {
    const upsert = vi.spyOn(prisma.user, "upsert");
    await expect(seedDevAccount(prisma, env)).rejects.toThrow(SeedRefusedError);
    expect(upsert).not.toHaveBeenCalled();
    expect(await prisma.user.count()).toBe(0);
  });

  describe("command line (npm run db:seed)", () => {
    it("exits 0 when allowed", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      expect(await runSeed(allowed, prisma)).toBe(0);
      expect(await prisma.user.count()).toBe(1);
    });

    it("exits non-zero with an explanation when refused", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(await runSeed({ NODE_ENV: "production", ALLOW_DEV_SEED: "true" }, prisma)).not.toBe(0);
      expect(String(error.mock.calls[0]?.[0])).toMatch(/refused/i);
      expect(await prisma.user.count()).toBe(0);
    });
  });
});
