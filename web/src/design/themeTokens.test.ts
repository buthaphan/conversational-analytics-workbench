import { describe, expect, it } from "vitest";
import { themeVariables } from "./tokens";

describe("typography tokens (AC-4)", () => {
  it("uses self-hosted Inter first, with a system fallback stack", () => {
    const sans = themeVariables["font-sans"] ?? "";
    expect(sans.startsWith('"Inter Variable"')).toBe(true);
    expect(sans).toMatch(/system-ui/);
    expect(sans).toMatch(/sans-serif$/);
  });

  it.each(["caption", "body-sm", "body", "label", "h3", "h2", "h1", "display"])(
    "defines the %s size with a line height",
    (step) => {
      expect(themeVariables[`text-${step}`]).toMatch(/rem$/);
      expect(themeVariables[`text-${step}--line-height`]).toBeDefined();
    },
  );

  it("has a strictly increasing scale from caption to display", () => {
    const steps = ["caption", "body-sm", "body", "h3", "h2", "h1", "display"];
    const sizes = steps.map((s) => parseFloat(themeVariables[`text-${s}`] ?? "0"));
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
    expect(new Set(sizes).size).toBe(sizes.length);
  });

  // TASK-004 DEC-004 tried one step smaller; the user asked to restore the TASK-002 scale.
  it("keeps body text at 1rem (16px) and captions at 0.75rem (12px)", () => {
    expect(themeVariables["text-body"]).toBe("1rem");
    expect(themeVariables["text-caption"]).toBe("0.75rem");
  });
});

describe("layout tokens (AC-5)", () => {
  it("uses breakpoints of 640, 768, 1024, and 1280 px", () => {
    expect(themeVariables["breakpoint-sm"]).toBe("40rem");
    expect(themeVariables["breakpoint-md"]).toBe("48rem");
    expect(themeVariables["breakpoint-lg"]).toBe("64rem");
    expect(themeVariables["breakpoint-xl"]).toBe("80rem");
  });

  it.each(["radius-sm", "radius-md", "radius-lg", "shadow-sm", "shadow-md", "spacing"])(
    "defines %s",
    (name) => {
      expect(themeVariables[name]).toBeTruthy();
    },
  );

  it.each(["border-width-default", "border-width-strong"])("defines %s", (name) => {
    expect(themeVariables[name]).toMatch(/px$/);
  });
});
