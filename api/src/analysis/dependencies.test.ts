import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * TASK-003 AC-14: production code depends only on the DataSource and LlmClient interfaces. Only the
 * module (which chooses the adapters) may import a concrete adapter; TASK-004 swaps them there.
 */
const ROOT = __dirname;
const ADAPTERS = /from "[^"]*(fixture-data-source|demo-llm-client)"/;
const ALLOWED = new Set(["analysis.module.ts"]);

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

describe("adapter dependencies (AC-14)", () => {
  it("only the module imports a concrete data source or model adapter", () => {
    const offenders = sources(ROOT)
      .map((path) => relative(ROOT, path).replaceAll("\\", "/"))
      .filter(
        (file) =>
          !ALLOWED.has(file) &&
          !/^(data\/fixture-data-source|llm\/demo-llm-client)\.ts$/.test(file),
      )
      .filter((file) => ADAPTERS.test(readFileSync(join(ROOT, file), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("the scripted test model (src/test, excluded from the build) is not used by production code", () => {
    const offenders = sources(ROOT).filter((path) =>
      /ScriptedLlmClient/.test(readFileSync(path, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
