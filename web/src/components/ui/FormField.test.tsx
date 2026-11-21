import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "../../test/axe";
import { FormField } from "./FormField";
import { Input } from "./Input";

describe("Input and FormField (AC-7)", () => {
  it("associates the visible label with the input", async () => {
    const user = userEvent.setup();
    render(<FormField label="Email">{(field) => <Input type="email" {...field} />}</FormField>);
    const input = screen.getByLabelText("Email");
    await user.click(screen.getByText("Email"));
    expect(input).toHaveFocus();
  });

  it("links an optional description", () => {
    render(
      <FormField label="Email" description="Use your work address.">
        {(field) => <Input {...field} />}
      </FormField>,
    );
    expect(screen.getByLabelText("Email")).toHaveAccessibleDescription("Use your work address.");
  });

  it("marks the input invalid and links the error message", () => {
    render(
      <FormField label="Email" description="Use your work address." error="Enter a valid email.">
        {(field) => <Input {...field} />}
      </FormField>,
    );
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(/Use your work address\./);
    expect(input).toHaveAccessibleDescription(/Enter a valid email\./);
  });

  it("is not marked invalid without an error", () => {
    render(<FormField label="Email">{(field) => <Input {...field} />}</FormField>);
    expect(screen.getByLabelText("Email")).not.toHaveAttribute("aria-invalid");
  });

  it("states that a field is required in text, not only by color", () => {
    render(
      <FormField label="Password" required>
        {(field) => <Input type="password" {...field} />}
      </FormField>,
    );
    const input = screen.getByLabelText(/Password/);
    expect(screen.getByText(/required/i)).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-required", "true");
  });

  it("uses a 3:1 token border and token focus style on the input", () => {
    render(<FormField label="Email">{(field) => <Input {...field} />}</FormField>);
    const input = screen.getByLabelText("Email");
    expect(input.className).toMatch(/(^|\s)border-border-input(\s|$)/);
    // Focus darkens and thickens the border rather than drawing an outline ring around the field.
    expect(input.className).toMatch(/focus-visible:border-fg-secondary/);
    expect(input.className).toMatch(/focus-visible:ring-fg-secondary/);
    expect(input.className).toMatch(/focus-visible:outline-none/);
  });

  it("switches to the error border when invalid", () => {
    render(
      <FormField label="Email" error="Required">
        {(field) => <Input {...field} />}
      </FormField>,
    );
    expect(screen.getByLabelText("Email").className).toMatch(/(^|\s)border-error(\s|$)/);
  });

  it.each([
    ["default", {}],
    ["with description", { description: "Hint" }],
    ["with error", { error: "Something is wrong." }],
    ["required", { required: true }],
  ])("has no axe violations (%s)", async (_, props) => {
    const { container } = render(
      <FormField label="Email" {...props}>
        {(field) => <Input {...field} />}
      </FormField>,
    );
    await expectNoAxeViolations(container);
  });
});
