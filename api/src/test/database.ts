import { existsSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

/** Loads the repository .env (if present) the same way prisma.config.ts does. Tests run from api/. */
export function loadLocalEnv(): void {
  if (existsSync("../.env")) process.loadEnvFile("../.env");
}

/**
 * The API test database URL. Refuses anything whose database name does not end in "_test",
 * so tests can never truncate a development or production database.
 */
export function testDatabaseUrl(): string {
  loadLocalEnv();
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error("TEST_DATABASE_URL is not set. Copy example.env to .env and start PostgreSQL.");
  }
  const name = new URL(url).pathname.replace(/^\//, "");
  if (!name.endsWith("_test")) {
    throw new Error(
      `Refusing to run tests against database "${name}": its name must end in "_test".`,
    );
  }
  return url;
}

export function createTestPrisma(): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: testDatabaseUrl() }) });
}

/** Empties every table between tests. */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    "TRUNCATE TABLE sign_in_attempts, auth_sessions, users RESTART IDENTITY CASCADE",
  );
}
