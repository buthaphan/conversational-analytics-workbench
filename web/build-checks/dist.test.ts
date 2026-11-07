// Runs after `vite build` (see the web "build" script) against the real production output.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { type BuildFile, findBuildProblems } from "../src/design/buildChecks";
import { parseColorTokens } from "../src/design/tokens";

const distDir = fileURLToPath(new URL("../dist", import.meta.url));
const tokensCss = readFileSync(
  fileURLToPath(new URL("../src/styles/tokens.css", import.meta.url)),
  "utf8",
);
const TEXT_FILE = /\.(html|css|js|mjs|svg|json|txt)$/;

function readBuild(dir: string): BuildFile[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return readBuild(path);
    return [
      {
        path: relative(distDir, path).split(sep).join("/"),
        text: TEXT_FILE.test(entry.name) ? readFileSync(path, "utf8") : "",
      },
    ];
  });
}

describe("production build output (AC-4, AC-10)", () => {
  it("exists", () => {
    expect(existsSync(join(distDir, "index.html"))).toBe(true);
  });

  it("bundles the font, defines every color token, uses no external hosts, and excludes the reference page", () => {
    const declaredColors = Object.keys(parseColorTokens(tokensCss));
    expect(declaredColors.length).toBeGreaterThan(0);
    expect(findBuildProblems(readBuild(distDir), declaredColors)).toEqual([]);
  });
});
