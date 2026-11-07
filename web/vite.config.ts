import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";
import { stripClientForwardedFor } from "./src/dev-server/stripForwardedFor";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Development: the browser talks only to Vite's origin; /api goes to the API (npm run dev -w api).
    // Same origin keeps the SameSite=Strict session cookie and the API's Origin check working.
    port: 5173,
    strictPort: true,
    proxy: { "/api": { target: "http://localhost:3000", configure: stripClientForwardedFor } },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // Load the token source so `tokens.css?raw` is real text in tests; other CSS stays stubbed.
    css: { include: [/tokens\.css/] },
  },
});
