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

  describe("TASK-005 additions (AC-3, AC-12, DEC-002)", () => {
    const series = (extra: object) => ({
      relevance: "other_capability",
      need: "new_data",
      action: {
        type: "request_data",
        capability: "sales_time_series",
        scope: { start_date: "2025-01-01", end_date: "2026-01-01" },
        ...extra,
      },
    });

    it.each([
      ["no parameters", {}],
      [
        "a product filter, a comparison, and the view settings",
        {
          parameters: {
            product_filter: { field: "category", values: ["Jeans", "Sweaters"] },
            comparison: { baseline: "previous_year" },
          },
          refinement: { interval: "week", measure: "order_count" },
        },
      ],
      ["the previous period", { parameters: { comparison: { baseline: "previous_period" } } }],
      [
        "a custom comparison",
        {
          parameters: {
            comparison: { baseline: "custom", start_date: "2024-01-01", end_date: "2025-01-01" },
          },
        },
      ],
      [
        "a department filter",
        { parameters: { product_filter: { field: "department", values: ["Men"] } } },
      ],
    ])("accepts a time-series request with %s", (_, extra) => {
      expect(parseTurnDecision(series(extra)).ok).toBe(true);
    });

    it.each(["category", "department", "brand", "none"])("accepts group_by %s", (group_by) => {
      expect(
        parseTurnDecision({
          ...base,
          action: { type: "refine", refinement: { group_by, limit: 30 } },
        }).ok,
      ).toBe(true);
    });

    it.each([
      ["a custom comparison without dates", { parameters: { comparison: { baseline: "custom" } } }],
      [
        "a previous-period comparison with dates",
        {
          parameters: {
            comparison: {
              baseline: "previous_period",
              start_date: "2024-01-01",
              end_date: "2025-01-01",
            },
          },
        },
      ],
      ["an unknown baseline", { parameters: { comparison: { baseline: "last_quarter" } } }],
      [
        "a brand filter",
        { parameters: { product_filter: { field: "brand", values: ["Northline"] } } },
      ],
      ["an empty filter", { parameters: { product_filter: { field: "category", values: [] } } }],
      [
        "more than 10 filter values",
        { parameters: { product_filter: { field: "category", values: Array(11).fill("Jeans") } } },
      ],
      ["an unknown interval", { refinement: { interval: "quarter" } }],
      // Walkthrough W2: the model packed two settings into one string.
      ["a malformed measure", { refinement: { measure: "order_count','interval':'week" } }],
      ["an unknown measure", { refinement: { measure: "profit" } }],
      ["a measure label instead of its name", { refinement: { measure: "Orders" } }],
      ["an extra parameter", { parameters: { sql: "select 1" } }],
    ])("rejects a time-series request with %s", (_, extra) => {
      expect(parseTurnDecision(series(extra)).ok).toBe(false);
    });

    it("offers the model exactly the three measures in its output schema (walkthrough W2)", () => {
      const schema = JSON.stringify(TURN_DECISION_JSON_SCHEMA);
      expect(schema).toContain(
        '"measure":{"type":"string","enum":["revenue","order_count","item_count"]}',
      );
    });

    it("rejects an unknown group_by", () => {
      expect(
        parseTurnDecision({
          ...base,
          action: { type: "refine", refinement: { group_by: "color" } },
        }).ok,
      ).toBe(false);
    });
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
    // TASK-005 AC-8: grouping is the refinement's group_by; the group analysis is removed.
    [
      "the removed group analysis",
      {
        ...base,
        action: { type: "analyze", analysis: { operation: "group", group_by: "category" } },
      },
    ],
    [
      "group_by on a summary",
      {
        ...base,
        action: {
          type: "analyze",
          analysis: { operation: "summary", field: "revenue", group_by: "category" },
        },
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
