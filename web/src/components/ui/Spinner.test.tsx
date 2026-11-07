import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "../../test/axe";
import { Spinner } from "./Spinner";

describe("Spinner (AC-7)", () => {
  it("is announced as a status with a default label", () => {
    render(<Spinner />);
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
  });

  it("accepts a custom label", () => {
    render(<Spinner label="Loading results" />);
    expect(screen.getByRole("status", { name: "Loading results" })).toBeInTheDocument();
  });

  it("is hidden from assistive technology when decorative", () => {
    const { container } = render(<Spinner decorative />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("only animates when the user has not asked for reduced motion", () => {
    const { container } = render(<Spinner />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("class")).toMatch(/(^|\s)motion-safe:animate-spin(\s|$)/);
    expect(svg?.getAttribute("class")).not.toMatch(/(^|\s)animate-spin(\s|$)/);
  });

  it("has no axe violations", async () => {
    const { container } = render(<Spinner />);
    await expectNoAxeViolations(container);
  });
});
