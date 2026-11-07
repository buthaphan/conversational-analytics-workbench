import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { REFERENCE_PAGE_MARKER } from "../design/buildChecks";
import { tokenRoles } from "../design/tokenRoles";
import { colors } from "../design/tokens";
import { expectNoAxeViolations } from "../test/axe";
import { ReferencePage } from "./ReferencePage";

vi.mock("echarts-for-react", () => ({
  default: () => <div data-testid="echarts" />,
}));

describe("Design reference page (AC-10)", () => {
  it("carries the development-only marker", () => {
    const { container } = render(<ReferencePage />);
    expect(container.querySelector(`[data-page="${REFERENCE_PAGE_MARKER}"]`)).not.toBeNull();
  });

  it("shows every color token with its name, role, and value", () => {
    render(<ReferencePage />);
    const section = screen.getByRole("region", { name: "Color tokens" });
    for (const [name, value] of Object.entries(colors)) {
      const swatch = within(section).getByTestId(`swatch-${name}`);
      expect(swatch).toHaveTextContent(`--color-${name}`);
      expect(swatch).toHaveTextContent(value);
      expect(swatch).toHaveTextContent(tokenRoles[name] ?? "missing role");
    }
  });

  it("shows the type scale", () => {
    render(<ReferencePage />);
    const section = screen.getByRole("region", { name: "Typography" });
    for (const step of ["caption", "body-sm", "body", "label", "h3", "h2", "h1", "display"]) {
      expect(within(section).getByText(`text-${step}`)).toBeInTheDocument();
    }
  });

  it("shows spacing, radius, and shadow samples", () => {
    render(<ReferencePage />);
    const section = screen.getByRole("region", { name: "Spacing, radius, and elevation" });
    for (const label of [
      "radius-sm",
      "radius-md",
      "radius-lg",
      "shadow-sm",
      "shadow-md",
      "spacing 4 (16px)",
    ]) {
      expect(within(section).getByText(label)).toBeInTheDocument();
    }
  });

  it("shows every button variant, plus disabled and loading states", () => {
    render(<ReferencePage />);
    const section = screen.getByRole("region", { name: "Buttons" });
    for (const variant of ["primary", "secondary", "ghost", "destructive"]) {
      expect(
        within(section)
          .getAllByRole("button")
          .some((b) => b.dataset.variant === variant),
      ).toBe(true);
    }
    expect(
      within(section)
        .getAllByRole("button")
        .some((b) => (b as HTMLButtonElement).disabled),
    ).toBe(true);
    expect(
      within(section)
        .getAllByRole("button")
        .some((b) => b.getAttribute("aria-busy") === "true"),
    ).toBe(true);
  });

  it("shows form field states", () => {
    render(<ReferencePage />);
    const section = screen.getByRole("region", { name: "Form fields" });
    expect(
      within(section)
        .getAllByRole("textbox")
        .some((i) => i.getAttribute("aria-invalid") === "true"),
    ).toBe(true);
    expect(within(section).getByText("(required)")).toBeInTheDocument();
    expect(
      within(section)
        .getAllByRole("textbox")
        .some((i) => (i as HTMLInputElement).disabled),
    ).toBe(true);
  });

  it("shows all four alert variants, a card, a table, and a spinner", () => {
    render(<ReferencePage />);
    const section = screen.getByRole("region", { name: "Feedback and containers" });
    expect(within(section).getAllByRole("alert")).toHaveLength(2);
    expect(within(section).getAllByRole("status").length).toBeGreaterThanOrEqual(3);
    expect(within(section).getByRole("region", { name: "Example card" })).toBeInTheDocument();
    expect(within(section).getByRole("table")).toBeInTheDocument();
  });

  it("shows a sample chart with its table, labelled as sample data", () => {
    render(<ReferencePage />);
    const section = screen.getByRole("region", { name: "Charts" });
    expect(within(section).getByRole("figure")).toBeInTheDocument();
    expect(within(section).getAllByRole("table").length).toBeGreaterThanOrEqual(1);
    expect(within(section).getByText(/illustrative sample values/i)).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = render(<ReferencePage />);
    await expectNoAxeViolations(container);
  });
});
