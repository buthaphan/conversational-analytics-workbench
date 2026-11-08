import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "../test/axe";
import { mockFetch } from "../test/fetch";
import { AuthApp, KEEP_ALIVE_MS } from "./AuthApp";

const user = { email: "user@example.test" };
const minute = 60 * 1000;
/** These tests are about the session; the workspace has its own tests (analysis/Workspace.test.tsx). */
const stubWorkspace = () => <p>Workspace content</p>;

function sessionCalls(fetchMock: ReturnType<typeof mockFetch>) {
  return fetchMock.mock.calls.filter(([url]) => String(url) === "/api/auth/session").length;
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("signed-in shell and session end (AC-14)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    setVisibility("visible");
  });

  const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

  it("shows the logo, product name, email, sign-out, and the workspace", async () => {
    mockFetch({ "GET /api/auth/session": { status: 200, body: { user } } });
    const { container } = render(<AuthApp workspace={stubWorkspace} />);
    expect(await screen.findByRole("button", { name: "Sign out" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: /conversational analytics workbench/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("user@example.test")).toBeInTheDocument();
    expect(screen.getByText("Workspace content")).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("keeps the session alive every 2 minutes", async () => {
    expect(KEEP_ALIVE_MS).toBe(2 * minute);
    const fetchMock = mockFetch({ "GET /api/auth/session": { status: 200, body: { user } } });
    render(<AuthApp workspace={stubWorkspace} />);
    await screen.findByRole("button", { name: "Sign out" });
    expect(sessionCalls(fetchMock)).toBe(1);
    await advance(2 * minute);
    expect(sessionCalls(fetchMock)).toBe(2);
    await advance(4 * minute);
    expect(sessionCalls(fetchMock)).toBe(4);
  });

  it("checks the session as soon as the tab becomes visible again", async () => {
    const fetchMock = mockFetch({ "GET /api/auth/session": { status: 200, body: { user } } });
    render(<AuthApp workspace={stubWorkspace} />);
    await screen.findByRole("button", { name: "Sign out" });
    setVisibility("hidden");
    await advance(1000);
    expect(sessionCalls(fetchMock)).toBe(1);
    await act(async () => setVisibility("visible"));
    await advance(0);
    expect(sessionCalls(fetchMock)).toBe(2);
  });

  it("returns to sign-in with the session-ended message when the session is gone", async () => {
    let signedIn = true;
    mockFetch({
      "GET /api/auth/session": () =>
        signedIn ? { status: 200, body: { user } } : { status: 401, body: {} },
    });
    render(<AuthApp workspace={stubWorkspace} />);
    await screen.findByRole("button", { name: "Sign out" });
    signedIn = false;
    await advance(2 * minute);
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Your session has ended. Sign in again.");
  });

  it("keeps the shell when a keep-alive cannot reach the server, and tries again later", async () => {
    let reachable = true;
    const fetchMock = mockFetch({
      "GET /api/auth/session": () =>
        reachable ? { status: 200, body: { user } } : "network-error",
    });
    render(<AuthApp workspace={stubWorkspace} />);
    await screen.findByRole("button", { name: "Sign out" });
    reachable = false;
    await advance(2 * minute);
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    reachable = true;
    await advance(2 * minute);
    expect(sessionCalls(fetchMock)).toBe(3);
  });

  it("stops keep-alive requests after signing out", async () => {
    const fetchMock = mockFetch({
      "GET /api/auth/session": { status: 200, body: { user } },
      "POST /api/auth/sign-out": { status: 204 },
    });
    render(<AuthApp workspace={stubWorkspace} />);
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await u.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("status")).toHaveTextContent("You have signed out.");
    const before = sessionCalls(fetchMock);
    await advance(6 * minute);
    expect(sessionCalls(fetchMock)).toBe(before);
  });

  it("shows an error and stays signed in when sign-out fails", async () => {
    mockFetch({
      "GET /api/auth/session": { status: 200, body: { user } },
      "POST /api/auth/sign-out": "network-error",
    });
    render(<AuthApp workspace={stubWorkspace} />);
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await u.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not sign out. Try again.");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  describe("a keep-alive answer that arrives late (review R5)", () => {
    /** The first session check succeeds; the next one is held until the test releases it as a 401. */
    function delayedKeepAlive() {
      let release401: () => void = () => {};
      let sessionCalls = 0;
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const key = `${(init?.method ?? "GET").toUpperCase()} ${String(input)}`;
        const reply = (status: number, body?: unknown) =>
          new Response(body === undefined ? null : JSON.stringify(body), { status });
        if (key === "GET /api/auth/session") {
          sessionCalls += 1;
          if (sessionCalls === 2) {
            await new Promise<void>((resolve) => (release401 = resolve));
            return reply(401, {});
          }
          return reply(200, { user });
        }
        if (key === "POST /api/auth/sign-out") return reply(204);
        if (key === "POST /api/auth/sign-in") return reply(200, { user });
        throw new Error(`Unexpected request: ${key}`);
      });
      vi.stubGlobal("fetch", fetchMock);
      return { release: () => act(async () => release401()) };
    }

    it("does not replace 'You have signed out.' when it answers 401 after sign-out", async () => {
      const keepAlive = delayedKeepAlive();
      render(<AuthApp workspace={stubWorkspace} />);
      const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await screen.findByRole("button", { name: "Sign out" });
      await advance(2 * minute); // keep-alive starts and waits
      await u.click(screen.getByRole("button", { name: "Sign out" }));
      expect(await screen.findByRole("status")).toHaveTextContent("You have signed out.");
      await keepAlive.release();
      await advance(0);
      expect(screen.getByRole("status")).toHaveTextContent("You have signed out.");
    });

    it("does not sign out a user who signed in again meanwhile", async () => {
      const keepAlive = delayedKeepAlive();
      render(<AuthApp workspace={stubWorkspace} />);
      const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await screen.findByRole("button", { name: "Sign out" });
      await advance(2 * minute); // keep-alive starts and waits
      await u.click(screen.getByRole("button", { name: "Sign out" }));
      await u.type(await screen.findByLabelText(/^Email/), "user@example.test");
      await u.type(screen.getByLabelText(/^Password/), "123456");
      await u.click(screen.getByRole("button", { name: "Sign in" }));
      await screen.findByRole("button", { name: "Sign out" });
      await keepAlive.release();
      await advance(0);
      expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Sign in" })).not.toBeInTheDocument();
    });
  });

  describe("sign-out edge cases (review round 2)", () => {
    /** Scripted replies: session checks answer in order; sign-out and sign-in use the given handlers. */
    function scripted(options: { sessions: number[]; signOut: () => Promise<Response> }) {
      let sessionIndex = 0;
      const reply = (status: number, body?: unknown) =>
        new Response(body === undefined ? null : JSON.stringify(body), { status });
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const key = `${(init?.method ?? "GET").toUpperCase()} ${String(input)}`;
          if (key === "GET /api/auth/session") {
            const status = options.sessions[Math.min(sessionIndex++, options.sessions.length - 1)]!;
            return status === 200 ? reply(200, { user }) : reply(status, {});
          }
          if (key === "POST /api/auth/sign-out") return options.signOut();
          if (key === "POST /api/auth/sign-in") return reply(200, { user });
          throw new Error(`Unexpected request: ${key}`);
        }),
      );
    }

    async function signInAgain(u: ReturnType<typeof userEvent.setup>) {
      await u.type(await screen.findByLabelText(/^Email/), "user@example.test");
      await u.type(screen.getByLabelText(/^Password/), "123456");
      await u.click(screen.getByRole("button", { name: "Sign in" }));
      await screen.findByRole("button", { name: "Sign out" });
    }

    it("N1: does not show an old sign-out error after the user signs in again", async () => {
      scripted({
        sessions: [200, 401, 200],
        signOut: async () => {
          throw new TypeError("Failed to fetch");
        },
      });
      render(<AuthApp workspace={stubWorkspace} />);
      const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await u.click(await screen.findByRole("button", { name: "Sign out" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Could not sign out. Try again.");
      await advance(2 * minute); // keep-alive gets 401: back to sign-in
      await signInAgain(u);
      expect(screen.queryByText("Could not sign out. Try again.")).not.toBeInTheDocument();
    });

    it("N2: ignores a sign-out reply that arrives after the user signed in again", async () => {
      let releaseSignOut: () => void = () => {};
      scripted({
        sessions: [200, 401, 200],
        signOut: () =>
          new Promise<Response>((resolve) => {
            releaseSignOut = () => resolve(new Response(null, { status: 204 }));
          }),
      });
      render(<AuthApp workspace={stubWorkspace} />);
      const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await u.click(await screen.findByRole("button", { name: "Sign out" })); // reply held
      await advance(2 * minute); // keep-alive gets 401: back to sign-in
      await signInAgain(u);
      // The new session's Sign out button must be usable while the old request is still stuck (N3).
      expect(screen.getByRole("button", { name: "Sign out" })).not.toHaveAttribute(
        "aria-busy",
        "true",
      );
      await act(async () => releaseSignOut());
      await advance(0);
      expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Sign in" })).not.toBeInTheDocument();
    });
  });

  it("shows the analysis workspace by default, and returns to sign-in when it finds the session ended (TASK-003 AC-13)", async () => {
    mockFetch({
      "GET /api/auth/session": { status: 200, body: { user } },
      "GET /api/analysis/state": { status: 401, body: {} },
    });
    render(<AuthApp />);
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Your session has ended. Sign in again.");
  });

  it("moves from sign-in to the shell after a successful sign-in", async () => {
    mockFetch({
      "GET /api/auth/session": { status: 401, body: {} },
      "POST /api/auth/sign-in": { status: 200, body: { user } },
    });
    render(<AuthApp workspace={stubWorkspace} />);
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await u.type(await screen.findByLabelText(/^Email/), "user@example.test");
    await u.type(screen.getByLabelText(/^Password/), "123456");
    await u.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("button", { name: "Sign out" })).toBeInTheDocument();
    expect(screen.getByText("user@example.test")).toBeInTheDocument();
  });
});
