import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "../../test/axe";
import { Alert, type AlertVariant } from "./Alert";

const CASES: [AlertVariant, "alert" | "status", string][] = [
  ["error", "alert", "Error"],
  ["warning", "alert", "Warning"],
  ["success", "status", "Success"],
  ["info", "status", "Information"],
];

describe("Alert (AC-7)", () => {
  it.each(CASES)(
    "%s uses role=%s and a text label as well as color",
    async (variant, role, label) => {
      const { container } = render(
        <Alert variant={variant} title="Heading">
          Details
        </Alert>,
      );
      const alert = screen.getByRole(role);
      expect(alert).toHaveTextContent(`${label}:`);
      expect(alert).toHaveTextContent("Heading");
      expect(alert).toHaveTextContent("Details");
      expect(alert.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
      expect(alert.className).toMatch(new RegExp(`(^|\\s)bg-${variant}-subtle(\\s|$)`));
      await expectNoAxeViolations(container);
    },
  );

  it("defaults to info", () => {
    render(<Alert>Note</Alert>);
    expect(screen.getByRole("status")).toHaveTextContent("Information:");
  });
});
