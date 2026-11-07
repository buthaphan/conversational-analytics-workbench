import { afterEach, describe, expect, it } from "vitest";
import { type TestApp, createTestApp, createUser } from "../test/app";
import { createTestPrisma, resetDatabase } from "../test/database";
import { DEV_ACCOUNT_EMAIL } from "./dev-seed";

const production = {
  NODE_ENV: "production",
  APP_ORIGIN: "https://showcase.example.test",
  COOKIE_SECURE: "true",
};

describe("production refuses to start with the development account (AC-12)", () => {
  const prisma = createTestPrisma();
  let started: TestApp | undefined;

  afterEach(async () => {
    await started?.close();
    started = undefined;
    await resetDatabase(prisma);
  });

  it("refuses when user@example.test exists", async () => {
    await resetDatabase(prisma);
    await createUser(prisma, DEV_ACCOUNT_EMAIL, "anything");
    await expect(createTestApp(production)).rejects.toThrow(/development account/i);
  });

  it("starts when the development account does not exist", async () => {
    await resetDatabase(prisma);
    await createUser(prisma, "real-user@example.test", "anything");
    started = await createTestApp(production);
    expect(started.app).toBeDefined();
  });

  it("does not check outside production", async () => {
    await resetDatabase(prisma);
    await createUser(prisma, DEV_ACCOUNT_EMAIL, "anything");
    started = await createTestApp({ NODE_ENV: "development" });
    expect(started.app).toBeDefined();
  });
});
