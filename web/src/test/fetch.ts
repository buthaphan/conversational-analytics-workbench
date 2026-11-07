import { vi } from "vitest";

type Reply = { status: number; body?: unknown; headers?: Record<string, string> } | "network-error";
type Handler = Reply | ((init: RequestInit | undefined) => Reply);

/**
 * Replaces global fetch with canned replies keyed by "METHOD /path". Unlisted requests fail the test.
 * Returns the mock so tests can inspect calls.
 */
export function mockFetch(routes: Record<string, Handler>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const key = `${method} ${String(input)}`;
    const handler = routes[key];
    if (handler === undefined) throw new Error(`Unexpected request: ${key}`);
    const reply = typeof handler === "function" ? handler(init) : handler;
    if (reply === "network-error") throw new TypeError("Failed to fetch");
    const body = reply.body === undefined ? null : JSON.stringify(reply.body);
    return new Response(body, {
      status: reply.status,
      headers: { "Content-Type": "application/json", ...reply.headers },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
