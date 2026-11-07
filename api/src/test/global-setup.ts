import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import { testDatabaseUrl } from "./database";

/** Applies all migrations to the test database once before the test run. Tests run from api/. */
export default function setup(): void {
  const url = testDatabaseUrl();
  const prismaCli = createRequire(join(process.cwd(), "package.json")).resolve(
    "prisma/build/index.js",
  );
  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}
