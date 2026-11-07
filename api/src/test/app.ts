import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import type { Response } from "supertest";
import { APP_OPTIONS, configureApp } from "../app";
import { AppModule } from "../app.module";
import { hashPassword } from "../auth/password";
import { type AppConfig, loadConfig } from "../config/config";
import { APP_CONFIG } from "../config/config.module";
import { PrismaClient } from "../generated/prisma/client";
import { Clock } from "../time/clock";
import { createTestPrisma, resetDatabase } from "./database";
import { FakeClock } from "./fake-clock";

export const TEST_ORIGIN = "http://localhost:5173";

export interface TestApp {
  app: NestExpressApplication;
  prisma: PrismaClient;
  clock: FakeClock;
  config: AppConfig;
  close(): Promise<void>;
}

/** Builds the real application against the test database, with a fake clock and test settings. */
export async function createTestApp(env: Record<string, string> = {}): Promise<TestApp> {
  const prisma = createTestPrisma();
  const clock = new FakeClock();
  const config = loadConfig({
    DATABASE_URL: "postgresql://replaced-by-test-prisma",
    APP_ORIGIN: TEST_ORIGIN,
    NODE_ENV: "test",
    ...env,
  });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(APP_CONFIG)
    .useValue(config)
    .overrideProvider(PrismaClient)
    .useValue(prisma)
    .overrideProvider(Clock)
    .useValue(clock)
    .compile();
  const app = configureApp(moduleRef.createNestApplication<NestExpressApplication>(APP_OPTIONS));
  await app.init();
  return {
    app,
    prisma,
    clock,
    config,
    async close() {
      await app.close();
      await prisma.$disconnect();
    },
  };
}

export { resetDatabase };

/** Creates a user with a fast password hash (parameters are stored in the hash, so verify still works). */
export async function createUser(prisma: PrismaClient, email: string, password: string) {
  return prisma.user.create({
    data: { email, passwordHash: await hashPassword(password, { N: 2 ** 14, r: 8, p: 1 }) },
  });
}

/** The session cookie value from a response, or undefined. */
export function sessionCookie(response: Response, name = "cawb_session"): string | undefined {
  const cookies = [response.headers["set-cookie"] ?? []].flat() as string[];
  const match = cookies.find((c) => c.startsWith(`${name}=`));
  return match?.split(";")[0]?.slice(name.length + 1);
}

/** The full Set-Cookie header for the session cookie (attributes included). */
export function sessionCookieHeader(response: Response, name = "cawb_session"): string | undefined {
  const cookies = [response.headers["set-cookie"] ?? []].flat() as string[];
  return cookies.find((c) => c.startsWith(`${name}=`));
}
