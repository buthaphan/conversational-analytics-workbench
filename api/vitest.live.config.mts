import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

/**
 * Live checks against BigQuery and the Anthropic API (TASK-004 AC-5, AC-7, AC-10). They need real
 * credentials, cost money or quota, and never run in `npm test` or CI: start them only through the
 * `live:*` scripts, which let Node load `../.env` into the environment. Each suite skips with a
 * message when its credentials are missing.
 */
export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    environment: "node",
    include: ["src/live/**/*.live.ts"],
    testTimeout: 180_000,
    fileParallelism: false,
  },
});
