import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "../../test/axe";
import { Button, type ButtonVariant } from "./Button";

const VARIANTS: ButtonVariant[] = ["primary", "secondary", "ghost", "destructive"];

/** The token classes each variant must use (F10: exact per variant, not "any token"). */
const VARIANT_CLASSES: Record<ButtonVariant, string[]> = {
  primary: ["bg-primary", "text-on-primary", "hover:bg-primary-hover"],
  secondary: ["bg-surface", "text-fg", "border-border-input", "hover:bg-surface-muted"],
  ghost: ["bg-transparent", "text-primary", "hover:bg-surface-muted"],
  destructive: ["bg-destructive", "text-on-destructive", "hover:bg-destructive-hover"],
};

describe("Button (AC-7)", () => {
  it("defaults to a non-submitting primary button", () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveAttribute("data-variant", "primary");
  });

  it.each(VARIANTS)("renders the %s variant with token colors and no axe violations", async (v) => {
    const { container } = render(<Button variant={v}>Action</Button>);
    const button = screen.getByRole("button", { name: "Action" });
    expect(button).toHaveAttribute("data-variant", v);
    const classes = button.className.split(/\s+/);
    expect(classes).toEqual(expect.arrayContaining(VARIANT_CLASSES[v]));
    for (const other of VARIANTS.filter((o) => o !== v)) {
      const foreign = VARIANT_CLASSES[other].filter((c) => !VARIANT_CLASSES[v].includes(c));
      expect(
        classes.filter((c) => foreign.includes(c)),
        `${other} classes on ${v}`,
      ).toEqual([]);
    }
    await expectNoAxeViolations(container);
  });

  it("calls onClick when activated by mouse or keyboard", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Run</Button>);
    await user.click(screen.getByRole("button", { name: "Run" }));
    await user.tab();
    await user.tab({ shift: true });
    await user.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("is reachable by keyboard and has a token focus-visible style", async () => {
    const user = userEvent.setup();
    render(<Button>Focus me</Button>);
    await user.tab();
    const button = screen.getByRole("button", { name: "Focus me" });
    expect(button).toHaveFocus();
    expect(button.className).toMatch(/focus-visible:outline-focus/);
  });

  it("cannot be activated when disabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  describe("loading", () => {
    it("shows a spinner, sets aria-busy, and keeps its accessible name", () => {
      render(<Button loading>Save</Button>);
      const button = screen.getByRole("button", { name: "Save" });
      expect(button).toHaveAttribute("aria-busy", "true");
      expect(button.querySelector("svg")).toBeInTheDocument();
    });

    it("stays focusable but ignores repeat activation", async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      render(
        <Button loading onClick={onClick}>
          Save
        </Button>,
      );
      const button = screen.getByRole("button", { name: "Save" });
      expect(button).not.toBeDisabled();
      expect(button).toHaveAttribute("aria-disabled", "true");
      await user.click(button);
      await user.click(button);
      expect(onClick).not.toHaveBeenCalled();
    });

    it("ignores keyboard activation with Enter and Space (F10)", async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      render(
        <Button loading onClick={onClick}>
          Save
        </Button>,
      );
      await user.tab();
      expect(screen.getByRole("button", { name: "Save" })).toHaveFocus();
      await user.keyboard("{Enter}");
      await user.keyboard(" ");
      expect(onClick).not.toHaveBeenCalled();
    });

    it("keeps its loading semantics even if a caller passes conflicting ARIA (F8)", () => {
      render(
        <Button loading aria-busy={false} aria-disabled={false}>
          Save
        </Button>,
      );
      const button = screen.getByRole("button", { name: "Save" });
      expect(button).toHaveAttribute("aria-busy", "true");
      expect(button).toHaveAttribute("aria-disabled", "true");
    });

    it("has no axe violations", async () => {
      const { container } = render(<Button loading>Save</Button>);
      await expectNoAxeViolations(container);
    });
  });
});
