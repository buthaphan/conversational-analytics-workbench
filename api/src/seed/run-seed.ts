import type { PrismaClient } from "../generated/prisma/client";
import { DEV_ACCOUNT_EMAIL, SeedRefusedError, seedDevAccount } from "./dev-seed";

/** Runs the development seed and returns the process exit code (0 success, 1 refused, 2 error). */
export async function runSeed(
  env: Record<string, string | undefined>,
  prisma: PrismaClient,
): Promise<number> {
  try {
    await seedDevAccount(prisma, env);
    console.log(`Development account ${DEV_ACCOUNT_EMAIL} is ready (local use only).`);
    return 0;
  } catch (error) {
    if (error instanceof SeedRefusedError) {
      console.error(error.message);
      return 1;
    }
    console.error(`Development seed failed: ${(error as Error).message}`);
    return 2;
  }
}
