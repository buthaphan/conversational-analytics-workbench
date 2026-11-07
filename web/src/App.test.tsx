import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("echarts-for-react", () => ({
  default: () => <div data-testid="echarts" />,
}));

describe("App shell", () => {
  it("renders the product name as the main heading", () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { level: 1, name: /conversational analytics workbench/i }),
    ).toBeInTheDocument();
  });

  it("shows the design reference in development", async () => {
    render(<App />);
    // The page is lazy-loaded; under full-suite parallel load the import can exceed the 1s default.
    expect(
      await screen.findByRole("heading", { name: "Design reference" }, { timeout: 5000 }),
    ).toBeInTheDocument();
  });
});
