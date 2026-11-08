import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * TASK-003 AC-14: production code depends only on the DataSource and LlmClient interfaces. Only the
 * module (which chooses the adapters) may import a concrete adapter; TASK-004 swaps them there.
 */
const ROOT = __dirname;
const SRC = join(__dirname, "..");
const ADAPTER_FILES = /^(data\/(fixture|bigquery)-data-source|llm\/(demo|claude)-llm-client)\.ts$/;
const ADAPTERS =
  /from "[^"]*(fixture-data-source|bigquery-data-source|demo-llm-client|claude-llm-client)"/;
const ALLOWED = new Set(["analysis.module.ts"]);
/** TASK-004 AC-4: each SDK may be imported only by its adapter. */
const SDKS: [RegExp, string][] = [
  [/from "@anthropic-ai\/sdk[^"]*"/, "analysis/llm/claude-llm-client.ts"],
  [/from "@google-cloud\/bigquery[^"]*"/, "analysis/data/bigquery-data-source.ts"],
];

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
      .filter((file) => !ALLOWED.has(file) && !ADAPTER_FILES.test(file))
      .filter((file) => ADAPTERS.test(readFileSync(join(ROOT, file), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("only the matching adapter imports the Anthropic or BigQuery SDK (TASK-004 AC-4)", () => {
    const offenders = sources(SRC)
      .map((path) => relative(SRC, path).replaceAll("\\", "/"))
      .filter((file) => !file.startsWith("generated/"))
      .flatMap((file) => {
        const text = readFileSync(join(SRC, file), "utf8");
        return SDKS.filter(([pattern, owner]) => file !== owner && pattern.test(text)).map(
          ([, owner]) => `${file} (only ${owner} may import this SDK)`,
        );
      });
    expect(offenders).toEqual([]);
  });

  it("the scripted test model (src/test, excluded from the build) is not used by production code", () => {
    const offenders = sources(ROOT).filter((path) =>
      /ScriptedLlmClient/.test(readFileSync(path, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
