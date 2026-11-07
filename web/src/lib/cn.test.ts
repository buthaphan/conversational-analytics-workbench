import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("joins conditional classes", () => {
    const active = ["a", "c"].includes("b");
    expect(cn("a", active && "b", undefined, "c")).toBe("a c");
  });

  it("keeps a custom text size and a text color together", () => {
    expect(cn("text-body", "text-fg")).toBe("text-body text-fg");
  });

  it("lets a later token color override an earlier one", () => {
    expect(cn("text-fg", "text-error")).toBe("text-error");
    expect(cn("bg-primary", "bg-destructive")).toBe("bg-destructive");
  });

  it("lets a later custom text size override an earlier one", () => {
    expect(cn("text-body", "text-caption")).toBe("text-caption");
  });

  it("treats hyphenated sizes and hyphenated colors as different groups (F10)", () => {
    expect(cn("text-body-sm", "text-fg")).toBe("text-body-sm text-fg");
    expect(cn("text-body-sm", "text-fg-secondary")).toBe("text-body-sm text-fg-secondary");
    expect(cn("text-fg-muted", "text-body-sm", "text-error")).toBe("text-body-sm text-error");
    expect(cn("text-body-sm", "text-h3")).toBe("text-h3");
  });
});
