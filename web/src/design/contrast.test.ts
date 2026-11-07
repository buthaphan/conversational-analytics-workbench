import { describe, expect, it } from "vitest";
import { contrastRatio, relativeLuminance } from "./contrast";

describe("relativeLuminance", () => {
  it("is 0 for black and 1 for white", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBe(1);
  });

  it("accepts 3-digit hex", () => {
    expect(relativeLuminance("#fff")).toBe(1);
  });

  it("rejects values that are not hex colors", () => {
    expect(() => relativeLuminance("teal")).toThrow();
    expect(() => relativeLuminance("#12345")).toThrow();
  });
});

describe("contrastRatio (WCAG 2.x)", () => {
  it("is 21:1 for black on white, in either order", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
  });

  it("is 1:1 for identical colors", () => {
    expect(contrastRatio("#14a38b", "#14a38b")).toBe(1);
  });

  it("puts #777777 on white just below the 4.5:1 AA threshold", () => {
    const ratio = contrastRatio("#777777", "#ffffff");
    expect(ratio).toBeLessThan(4.5);
    expect(ratio).toBeGreaterThan(4.4);
  });

  it("puts #767676 on white at or above 4.5:1", () => {
    expect(contrastRatio("#767676", "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
});
