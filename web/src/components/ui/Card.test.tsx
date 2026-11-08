import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "../../test/axe";
import { Card } from "./Card";

describe("Card (AC-7)", () => {
  it("renders body content on a token surface", () => {
    const { container } = render(<Card>Body</Card>);
    expect(screen.getByText("Body")).toBeInTheDocument();
    expect(container.firstElementChild?.className).toMatch(/(^|\s)bg-surface(\s|$)/);
  });

  it("renders an optional title as a heading (level 3 by default) and labels the card", () => {
    render(<Card title="Revenue">Body</Card>);
    expect(screen.getByRole("heading", { level: 3, name: "Revenue" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Revenue" })).toBeInTheDocument();
  });

  it("supports a different heading level", () => {
    render(
      <Card title="Revenue" headingLevel={2}>
        Body
      </Card>,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Revenue" })).toBeInTheDocument();
  });

  it("renders an optional footer", () => {
    render(<Card footer={<span>Updated today</span>}>Body</Card>);
    expect(screen.getByText("Updated today")).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <Card title="Revenue" footer="Footer">
        Body
      </Card>,
    );
    await expectNoAxeViolations(container);
  });

  it("compact keeps the heading level and region name, with the smaller heading size (TASK-004 DEC-004)", () => {
    render(
      <Card title="Customer spending" headingLevel={2} compact>
        Body
      </Card>,
    );
    const heading = screen.getByRole("heading", { level: 2, name: "Customer spending" });
    expect(heading).toHaveClass("text-h3");
    expect(heading).not.toHaveClass("text-h2");
    expect(screen.getByRole("region", { name: "Customer spending" })).toBeInTheDocument();
  });
});
