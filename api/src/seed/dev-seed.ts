import { hashPassword } from "../auth/password";
import type { PrismaClient } from "../generated/prisma/client";

/**
 * The local development and test account (PROJECT-SETUP.md). The password is a deliberately weak,
 * documented placeholder: it must never exist outside local development and tests.
 */
export const DEV_ACCOUNT_EMAIL = "user@example.test";
export const DEV_ACCOUNT_PASSWORD = "123456";

export class SeedRefusedError extends Error {
  constructor(reason: string) {
    super(`Development seed refused: ${reason}`);
    this.name = "SeedRefusedError";
  }
}

type Env = Record<string, string | undefined>;

/** Both conditions are required: NODE_ENV is development or test, and ALLOW_DEV_SEED is exactly "true". */
function assertAllowed(env: Env): void {
  if (env.NODE_ENV !== "development" && env.NODE_ENV !== "test") {
    throw new SeedRefusedError(
      `NODE_ENV must be development or test (got "${env.NODE_ENV ?? ""}").`,
    );
  }
  if (env.ALLOW_DEV_SEED !== "true") {
    throw new SeedRefusedError('ALLOW_DEV_SEED must be "true".');
  }
}

/** Creates or updates the development account. Checks the guards before touching the database. */
export async function seedDevAccount(prisma: PrismaClient, env: Env): Promise<void> {
  assertAllowed(env);
  const passwordHash = await hashPassword(DEV_ACCOUNT_PASSWORD);
  await prisma.user.upsert({
    where: { email: DEV_ACCOUNT_EMAIL },
    create: { email: DEV_ACCOUNT_EMAIL, passwordHash },
    update: { passwordHash },
  });
}
