import { describe, expect, it, vi } from "vitest";
import viteConfig from "../../vite.config";
import { stripClientForwardedFor } from "./stripForwardedFor";

describe("development proxy (review R4)", () => {
  it("removes any X-Forwarded-For the browser sent before forwarding to the API", () => {
    let onProxyRequest: ((proxyReq: { removeHeader(name: string): void }) => void) | undefined;
    stripClientForwardedFor({
      on: (event, listener) => {
        if (event === "proxyReq") onProxyRequest = listener;
      },
    });
    const proxyReq = { removeHeader: vi.fn() };
    onProxyRequest?.(proxyReq);
    expect(proxyReq.removeHeader).toHaveBeenCalledWith("x-forwarded-for");
  });

  it("is applied to the /api proxy in vite.config.ts", () => {
    const proxy = viteConfig.server?.proxy as Record<string, { configure?: unknown }>;
    expect(proxy["/api"]?.configure).toBe(stripClientForwardedFor);
  });
});
