// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { findColorLiterals } from "./colorLiterals";

describe("findColorLiterals", () => {
  it("finds hex, rgb(), hsl(), and oklch() literals", () => {
    const source = `
      const a = "#1a2b3c";
      const b = "#fff";
      const c = "rgb(0, 0, 0)";
      const d = "rgba(0,0,0,.5)";
      const e = "hsl(10 20% 30%)";
      const f = "oklch(0.5 0.1 200)";
      const g = "bg-[#123456]";
    `;
    expect(findColorLiterals(source)).toEqual([
      "#1a2b3c",
      "#fff",
      "rgb(",
      "rgba(",
      "hsl(",
      "oklch(",
      "#123456",
    ]);
  });

  it("ignores token utilities, CSS variables, and ids", () => {
    const source = `className="bg-surface text-fg ring-focus" style={{ color: "var(--color-fg)" }} getElementById("root")`;
    expect(findColorLiterals(source)).toEqual([]);
  });

  describe("named colors (F3)", () => {
    it.each([
      ['className="bg-[red]"', "bg-[red]"],
      ['className="text-[color:crimson]"', "text-[color:crimson]"],
      ['className="border-t-[blue]"', "border-t-[blue]"],
      ['className="hover:ring-[teal]"', "ring-[teal]"],
      ['style={{ color: "crimson" }}', 'color: "crimson"'],
      ["style={{ backgroundColor: 'teal' }}", "backgroundColor: 'teal'"],
      ['<path fill="red" />', 'fill="red"'],
      ['<circle stroke="navy" />', 'stroke="navy"'],
    ])("flags %s", (source, expected) => {
      expect(findColorLiterals(source)).toEqual([expected]);
    });

    it.each([
      'className="w-[320px] text-[14px] grid-cols-[8rem_1fr] text-[length:var(--x)]"',
      'className="bg-[var(--color-fg)] border-[2px]"',
      "style={{ background: `var(--color-${name})` }}",
      'style={{ backgroundColor: "transparent", color: "currentColor" }}',
      '<path fill="none" stroke="currentColor" />',
      "const option = { color: palette, textStyle: { color: token('fg') } };",
    ])("allows %s", (source) => {
      expect(findColorLiterals(source)).toEqual([]);
    });
  });
});

describe("no raw color literals outside the token source (AC-6)", () => {
  const srcDir = fileURLToPath(new URL("..", import.meta.url));

  /**
   * Files allowed to contain color literals:
   * - styles/tokens.css: the single source of truth for token values.
   * - logo.svg: the approved brand logo asset (copied from assets/brand/), not UI styling.
   * - logo-on-dark.svg: the same logo with light wordmark and ring for the navy header
   *   (TASK-004 DEC-004; copied from assets/brand/).
   */
  const EXEMPT = new Set(["styles/tokens.css", "logo.svg", "logo-on-dark.svg"]);

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === "test" ? [] : sourceFiles(path);
      return /\.(ts|tsx|js|jsx|css|svg)$/.test(entry.name) && !/\.test\.[jt]sx?$/.test(entry.name)
        ? [path]
        : [];
    });
  }

  it("scans JavaScript, TypeScript, CSS, and SVG sources", () => {
    const files = sourceFiles(srcDir).map((file) => relative(srcDir, file).split(sep).join("/"));
    expect(files).toEqual(expect.arrayContaining(["App.tsx", "styles/tokens.css", "logo.svg"]));
  });

  it("finds literals only in exempt files", () => {
    const offenders = sourceFiles(srcDir)
      .map((file) => relative(srcDir, file).split(sep).join("/"))
      .filter((file) => !EXEMPT.has(file))
      .flatMap((file) =>
        findColorLiterals(readFileSync(join(srcDir, file), "utf8")).map((hit) => `${file}: ${hit}`),
      );
    expect(offenders).toEqual([]);
  });
});
