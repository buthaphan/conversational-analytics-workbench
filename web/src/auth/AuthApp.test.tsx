import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "../test/axe";
import { mockFetch } from "../test/fetch";
import { AuthApp, KEEP_ALIVE_MS } from "./AuthApp";

const user = { email: "user@example.test" };
const minute = 60 * 1000;

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

  it("shows the logo, product name, email, sign-out, and a workspace placeholder", async () => {
    mockFetch({ "GET /api/auth/session": { status: 200, body: { user } } });
    const { container } = render(<AuthApp />);
    expect(await screen.findByRole("button", { name: "Sign out" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: /conversational analytics workbench/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("user@example.test")).toBeInTheDocument();
    expect(screen.getByText(/analytics workspace arrives in a later task/i)).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("keeps the session alive every 2 minutes", async () => {
    expect(KEEP_ALIVE_MS).toBe(2 * minute);
    const fetchMock = mockFetch({ "GET /api/auth/session": { status: 200, body: { user } } });
    render(<AuthApp />);
    await screen.findByRole("button", { name: "Sign out" });
    expect(sessionCalls(fetchMock)).toBe(1);
    await advance(2 * minute);
    expect(sessionCalls(fetchMock)).toBe(2);
    await advance(4 * minute);
    expect(sessionCalls(fetchMock)).toBe(4);
  });

  it("checks the session as soon as the tab becomes visible again", async () => {
    const fetchMock = mockFetch({ "GET /api/auth/session": { status: 200, body: { user } } });
    render(<AuthApp />);
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
    render(<AuthApp />);
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
    render(<AuthApp />);
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
    render(<AuthApp />);
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
    render(<AuthApp />);
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await u.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not sign out. Try again.");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("moves from sign-in to the shell after a successful sign-in", async () => {
    mockFetch({
      "GET /api/auth/session": { status: 401, body: {} },
      "POST /api/auth/sign-in": { status: 200, body: { user } },
    });
    render(<AuthApp />);
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await u.type(await screen.findByLabelText(/^Email/), "user@example.test");
    await u.type(screen.getByLabelText(/^Password/), "123456");
    await u.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("button", { name: "Sign out" })).toBeInTheDocument();
    expect(screen.getByText("user@example.test")).toBeInTheDocument();
  });
});
