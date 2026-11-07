import { defineConfig } from "vitest/config";

/** Checks the production build in web/dist. Run by the "build" script after `vite build`. */
export default defineConfig({
  test: {
    environment: "node",
    include: ["build-checks/**/*.test.ts"],
    // tokens.ts imports tokens.css?raw; keep it as real text (same as vite.config.ts).
    css: { include: [/tokens\.css/] },
  },
});
