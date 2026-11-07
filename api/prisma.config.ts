import { existsSync } from "node:fs";
import { defineConfig, env } from "prisma/config";

// Prisma 7 does not load .env files itself. Commands run from api/, so the repository .env is "../.env".
// In containers and CI the variables come from the environment instead.
if (existsSync("../.env")) process.loadEnvFile("../.env");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("DATABASE_URL") },
});
