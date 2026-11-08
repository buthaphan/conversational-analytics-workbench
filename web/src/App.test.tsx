import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { mockFetch } from "./test/fetch";

// The shell tests are not about charts. Mocking both ECharts packages keeps the lazy-loaded
// reference page fast: the real `echarts` import was most of its load time (TASK-002 R1).
vi.mock("echarts-for-react", () => ({
  default: () => <div data-testid="echarts" />,
}));
vi.mock("echarts", () => ({ registerTheme: () => {} }));

// The test timeout must exceed the findBy wait, or Vitest stops the test before the wait ends.
const LAZY_PAGE_WAIT_MS = 10_000;
const LAZY_PAGE_TEST_TIMEOUT_MS = 15_000;
const user = { email: "user@example.test" };

describe("App shell (AC-14, AC-15)", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("always shows the product name as the main heading", async () => {
    mockFetch({ "GET /api/auth/session": { status: 401, body: {} } });
    render(<App />);
    expect(
      screen.getByRole("heading", { level: 1, name: /conversational analytics workbench/i }),
    ).toBeInTheDocument();
    await screen.findByRole("heading", { name: "Sign in" });
  });

  it("shows a loading status while it checks the session", async () => {
    mockFetch({ "GET /api/auth/session": { status: 401, body: {} } });
    render(<App />);
    expect(screen.getByRole("status", { name: "Checking your session" })).toBeInTheDocument();
    await screen.findByRole("heading", { name: "Sign in" });
  });

  it("shows the sign-in screen without a valid session", async () => {
    mockFetch({ "GET /api/auth/session": { status: 401, body: {} } });
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
  });

  it("shows the signed-in shell with a valid session, so a refresh keeps the user signed in", async () => {
    mockFetch({
      "GET /api/auth/session": { status: 200, body: { user } },
      "GET /api/analysis/state": {
        status: 200,
        body: { messages: [], activeResult: null, pending: null, demoExamples: null },
      },
    });
    render(<App />);
    expect(await screen.findByRole("button", { name: "Sign out" })).toBeInTheDocument();
    expect(await screen.findByRole("textbox", { name: "Ask a question" })).toBeInTheDocument();
    expect(screen.getByText("user@example.test")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Sign in" })).not.toBeInTheDocument();
  });

  it("shows the sign-in screen with an error when the server cannot be reached", async () => {
    mockFetch({ "GET /api/auth/session": "network-error" });
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Could not reach the server. Try again.");
  });

  it(
    "shows the design reference at /design-reference in development, without signing in",
    async () => {
      const fetchMock = mockFetch({});
      window.history.pushState({}, "", "/design-reference");
      render(<App />);
      expect(
        await screen.findByRole(
          "heading",
          { name: "Design reference" },
          { timeout: LAZY_PAGE_WAIT_MS },
        ),
      ).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    },
    LAZY_PAGE_TEST_TIMEOUT_MS,
  );
});
