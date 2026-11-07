import { onTestFinished, vi } from "vitest";

type Reply = { status: number; body?: unknown; headers?: Record<string, string> } | "network-error";
type Handler = Reply | ((init: RequestInit | undefined) => Reply);

/**
 * Replaces global fetch with canned replies keyed by "METHOD /path". Returns the mock so tests can
 * inspect calls. An unlisted request fails the test when it finishes: the app's API client turns any
 * fetch error into a "network" result, so throwing alone would go unnoticed (review R2d).
 */
export function mockFetch(routes: Record<string, Handler>) {
  const unexpected: string[] = [];
  onTestFinished(() => {
    if (unexpected.length > 0) throw new Error(`Unexpected requests: ${unexpected.join(", ")}`);
  });
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const key = `${method} ${String(input)}`;
    const handler = routes[key];
    if (handler === undefined) {
      unexpected.push(key);
      throw new Error(`Unexpected request: ${key}`);
    }
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
