import { describe, expect, it } from "vitest";
import {
  REQUIRED_COLOR_ROLES,
  colorPairings,
  colors,
  findContrastFailures,
  parseColorTokens,
  parseThemeVariables,
} from "./tokens";

const HEX = /^#[0-9a-f]{6}$/i;

describe("parseColorTokens", () => {
  it("reads --color-* hex declarations and ignores other declarations", () => {
    const css = `@theme {
      --color-*: initial;
      --color-surface: #ffffff;
      --color-fg: #142433;
      --font-sans: "Inter";
    }`;
    expect(parseColorTokens(css)).toEqual({ surface: "#ffffff", fg: "#142433" });
  });

  it("rejects a duplicated token name", () => {
    const css = `--color-fg: #000000; --color-fg: #111111;`;
    expect(() => parseColorTokens(css)).toThrow(/duplicate/i);
  });

  it("ignores declarations inside CSS comments (F11)", () => {
    const css = `/* --color-fg: #000000; */ --color-fg: #142433; /*
      --color-old: #123456;
    */`;
    expect(parseColorTokens(css)).toEqual({ fg: "#142433" });
  });
});

describe("parseThemeVariables", () => {
  it("ignores declarations inside CSS comments (F11)", () => {
    const css = `/* --radius-sm: 1px; */ --radius-sm: 0.25rem;`;
    expect(parseThemeVariables(css)).toEqual({ "radius-sm": "0.25rem" });
  });
});

describe("color tokens (AC-2)", () => {
  it.each(REQUIRED_COLOR_ROLES)("defines the %s role as a 6-digit hex color", (role) => {
    expect(colors[role]).toMatch(HEX);
  });

  it("includes the three brand anchors at their exact values", () => {
    expect(colors["brand-navy"]?.toLowerCase()).toBe("#18324b");
    expect(colors["brand-teal"]?.toLowerCase()).toBe("#14a38b");
    expect(colors["brand-gold"]?.toLowerCase()).toBe("#e5a93d");
  });
});

describe("findContrastFailures", () => {
  it("reports a pairing below its required ratio", () => {
    const failures = findContrastFailures({ fg: "#777777", bg: "#ffffff" }, [
      { fg: "fg", bg: "bg", use: "text" },
    ]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ fg: "fg", bg: "bg", required: 4.5 });
  });

  it("uses 3:1 for large text and non-text UI", () => {
    const tokens = { a: "#949494", bg: "#ffffff" }; // about 3.03:1
    expect(findContrastFailures(tokens, [{ fg: "a", bg: "bg", use: "large-text" }])).toEqual([]);
    expect(findContrastFailures(tokens, [{ fg: "a", bg: "bg", use: "ui" }])).toEqual([]);
    expect(findContrastFailures(tokens, [{ fg: "a", bg: "bg", use: "text" }])).toHaveLength(1);
  });

  it("reports a pairing that names an unknown token", () => {
    expect(
      findContrastFailures({ bg: "#ffffff" }, [{ fg: "missing", bg: "bg", use: "text" }]),
    ).toHaveLength(1);
  });
});

describe("declared pairings meet WCAG 2.2 AA (AC-3)", () => {
  it("has no failing pairing", () => {
    expect(findContrastFailures(colors, colorPairings)).toEqual([]);
  });

  it.each([
    ["fg", "success-subtle"],
    ["fg", "warning-subtle"],
    ["fg", "error-subtle"],
    ["fg", "info-subtle"],
    ["accent", "surface-muted"],
    ["on-primary", "brand-navy"], // header title and email (TASK-004 DEC-004)
  ])("declares %s on %s as text, because components use it (F2)", (fg, bg) => {
    expect(colorPairings).toContainEqual({ fg, bg, use: "text" });
  });

  it("declares the header focus ring (on-primary on brand-navy) as UI (TASK-004 DEC-004)", () => {
    expect(colorPairings).toContainEqual({ fg: "on-primary", bg: "brand-navy", use: "ui" });
  });

  it("only uses the raw brand teal and gold for non-text accents", () => {
    const textUses = colorPairings.filter(
      (p) => p.use === "text" && ["brand-teal", "brand-gold"].includes(p.fg),
    );
    expect(textUses).toEqual([]);
  });
});
