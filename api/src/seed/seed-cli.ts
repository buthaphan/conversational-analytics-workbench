// Entry point for `npm run db:seed -w api`. Environment comes from ../.env (npm) or the container.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { runSeed } from "./run-seed";

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is required.");
    process.exitCode = 2;
    return;
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    process.exitCode = await runSeed(process.env, prisma);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
