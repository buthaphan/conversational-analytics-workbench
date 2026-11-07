import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// NestJS relies on decorator metadata, which Vitest's default compiler does not emit; SWC does.
export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./src/test/setup.ts"],
    // Migrates the dedicated test database once per run (refuses databases not named "*_test").
    globalSetup: ["./src/test/global-setup.ts"],
    // Test files share one database, so they run one at a time.
    fileParallelism: false,
  },
});
