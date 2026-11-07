import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";

// The shell test is not about charts. Mocking both ECharts packages keeps the lazy-loaded
// reference page fast: the real `echarts` import was most of its load time (R1).
vi.mock("echarts-for-react", () => ({
  default: () => <div data-testid="echarts" />,
}));
vi.mock("echarts", () => ({ registerTheme: () => {} }));

// The test timeout must exceed the findBy wait, or Vitest stops the test before the wait ends.
const LAZY_PAGE_WAIT_MS = 10_000;
const LAZY_PAGE_TEST_TIMEOUT_MS = 15_000;

describe("App shell", () => {
  it("renders the product name as the main heading", () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { level: 1, name: /conversational analytics workbench/i }),
    ).toBeInTheDocument();
  });

  it(
    "shows the design reference in development",
    async () => {
      render(<App />);
      // The page is lazy-loaded; under full-suite parallel load the import can exceed the 1s default.
      expect(
        await screen.findByRole(
          "heading",
          { name: "Design reference" },
          { timeout: LAZY_PAGE_WAIT_MS },
        ),
      ).toBeInTheDocument();
    },
    LAZY_PAGE_TEST_TIMEOUT_MS,
  );
});
