import { afterEach, describe, expect, it } from "vitest";
import { type TestApp, createTestApp } from "../test/app";
import { BigQueryDataSource } from "./data/bigquery-data-source";
import { DataSource } from "./data/data-source";
import { FixtureDataSource } from "./data/fixture-data-source";
import { ClaudeLlmClient } from "./llm/claude-llm-client";
import { DemoLlmClient } from "./llm/demo-llm-client";
import { LlmClient, UnconfiguredLlmClient } from "./llm/llm-client";

/** TASK-004 AC-4: the module picks the adapters from the configuration. */
describe("analysis module wiring (TASK-004 AC-4)", () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  it("uses the fixture and the demo model by default", async () => {
    t = await createTestApp();
    expect(t.app.get(DataSource)).toBeInstanceOf(FixtureDataSource);
    expect(t.app.get(LlmClient)).toBeInstanceOf(DemoLlmClient);
  });

  it("uses BigQuery when DATA_SOURCE=bigquery (no query is sent at startup)", async () => {
    t = await createTestApp({ DATA_SOURCE: "bigquery", GOOGLE_CLOUD_PROJECT: "cawb-test-123" });
    expect(t.app.get(DataSource)).toBeInstanceOf(BigQueryDataSource);
  });

  it("uses Claude when ANALYSIS_MODEL=claude (no request is sent at startup)", async () => {
    t = await createTestApp({ ANALYSIS_MODEL: "claude", ANTHROPIC_API_KEY: "sk-test-not-real" });
    expect(t.app.get(LlmClient)).toBeInstanceOf(ClaudeLlmClient);
  });

  it("uses no model when ANALYSIS_MODEL=none", async () => {
    t = await createTestApp({ ANALYSIS_MODEL: "none" });
    expect(t.app.get(LlmClient)).toBeInstanceOf(UnconfiguredLlmClient);
  });
});
