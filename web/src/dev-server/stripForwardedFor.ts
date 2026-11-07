/** The part of Vite's proxy server this helper uses. */
interface ProxyEvents {
  on(
    event: "proxyReq",
    listener: (proxyReq: { removeHeader(name: string): void }) => void,
  ): unknown;
}

/**
 * Development only (review R4): drops any X-Forwarded-For header the browser sent. The API trusts
 * this proxy, so a client-supplied value would otherwise let a request pick its own IP address and
 * escape the per-IP sign-in limit. In Docker, nginx replaces the header instead.
 */
export function stripClientForwardedFor(proxy: ProxyEvents): void {
  proxy.on("proxyReq", (proxyReq) => {
    proxyReq.removeHeader("x-forwarded-for");
  });
}
