import { describe, expect, it } from "vitest";
import { TURN_DECISION_JSON_SCHEMA, parseTurnDecision } from "./turn-decision";

const base = { relevance: "active_result", need: "answerable_now" } as const;

describe("TurnDecision (AC-3, TD-1)", () => {
  it.each([
    {
      ...base,
      action: { type: "refine", refinement: { sort: { field: "total_spend", direction: "asc" } } },
    },
    {
      ...base,
      need: "analysis_on_current",
      action: {
        type: "analyze",
        analysis: { operation: "concentration", measure: "total_spend", top_percent: 10 },
      },
    },
    { ...base, action: { type: "change_view", view: "table" } },
    {
      relevance: "other_capability",
      need: "new_data",
      action: {
        type: "request_data",
        capability: "product_sales_performance",
        scope: { start_date: "2025-01-01", end_date: "2026-01-01" },
      },
    },
    { ...base, action: { type: "confirm_switch", accept: true } },
    { ...base, need: "unclear", action: { type: "clarify", question: "Revenue or units?" } },
    {
      relevance: "unrelated",
      need: "unsupported",
      action: {
        type: "reply",
        message: "I can only answer questions about the sales data.",
        reason: "unrelated",
      },
    },
  ])("accepts a valid $action.type decision", (decision) => {
    expect(parseTurnDecision(decision).ok).toBe(true);
  });

  it("defaults the analysis target to the complete result set", () => {
    const result = parseTurnDecision({
      ...base,
      action: { type: "analyze", analysis: { operation: "summary", field: "total_spend" } },
    });
    expect(
      result.ok &&
        result.decision.action.type === "analyze" &&
        result.decision.action.analysis.target,
    ).toBe("complete");
  });

  it("accepts the model's raw JSON text", () => {
    expect(
      parseTurnDecision(JSON.stringify({ ...base, action: { type: "change_view", view: "bar" } }))
        .ok,
    ).toBe(true);
  });

  it.each([
    ["malformed JSON text", '{"relevance": "active_result",'],
    ["not an object", 42],
    ["missing relevance", { need: "answerable_now", action: { type: "change_view", view: "bar" } }],
    [
      "unknown relevance",
      { ...base, relevance: "maybe", action: { type: "change_view", view: "bar" } },
    ],
    ["unknown action", { ...base, action: { type: "run_sql", sql: "DROP TABLE users" } }],
    [
      "extra top-level field",
      { ...base, sql: "select 1", action: { type: "change_view", view: "bar" } },
    ],
    [
      "analyze without an operation",
      { ...base, action: { type: "analyze", analysis: { field: "total_spend" } } },
    ],
    [
      "concentration with both top_count and top_percent",
      {
        ...base,
        action: {
          type: "analyze",
          analysis: {
            operation: "concentration",
            measure: "revenue",
            top_count: 5,
            top_percent: 10,
          },
        },
      },
    ],
    [
      "concentration with neither",
      {
        ...base,
        action: { type: "analyze", analysis: { operation: "concentration", measure: "revenue" } },
      },
    ],
    ["empty clarification", { ...base, action: { type: "clarify", question: "" } }],
    [
      "oversized reply",
      { ...base, action: { type: "reply", message: "x".repeat(1001), reason: "other" } },
    ],
  ])("rejects %s", (_, raw) => {
    const result = parseTurnDecision(raw);
    expect(result.ok).toBe(false);
  });

  it("exports a JSON Schema for TASK-004's structured output", () => {
    expect(TURN_DECISION_JSON_SCHEMA).toMatchObject({ type: "object" });
    expect(JSON.stringify(TURN_DECISION_JSON_SCHEMA)).toContain("request_data");
  });
});
