import { describe, expect, it } from "vitest";
import { ANSWERS } from "../answers/answers";
import type { ModelContext } from "../context/model-context";
import { parseTurnDecision } from "../decision/turn-decision";
import { DEMO_EXAMPLES, DemoLlmClient, normalizePhrase } from "./demo-llm-client";

const demo = new DemoLlmClient();
const context = { today: "2026-11-08" } as ModelContext;
const decide = async (text: string) => {
  const parsed = parseTurnDecision(await demo.decide(context, text));
  if (!parsed.ok) throw new Error(`invalid decision for "${text}"`);
  return parsed.decision.action;
};

describe("demo model (TASK-003 AC-15, DEC-001)", () => {
  it("normalizes case, spacing, curly apostrophes, and end punctuation", () => {
    expect(normalizePhrase("  What’s the   WEATHER today?! ")).toBe("what's the weather today");
  });

  it.each(DEMO_EXAMPLES)("maps the example %j to a valid TurnDecision", async (example) => {
    await expect(decide(example)).resolves.toBeDefined();
  });

  it("covers every workflow path of the walkthrough", async () => {
    expect(await decide("Who spent the most last year?")).toMatchObject({ type: "clarify" });
    expect(await decide("The previous calendar year")).toEqual({
      type: "request_data",
      capability: "customer_spending",
      scope: { start_date: "2025-01-01", end_date: "2026-01-01" },
      refinement: { sort: { field: "total_spend", direction: "desc" }, limit: 10 },
    });
    expect(await decide("The last 12 months")).toMatchObject({
      scope: { start_date: "2025-11-08", end_date: "2026-11-08" },
    });
    expect(await decide("Show the lowest spenders")).toEqual({
      type: "refine",
      refinement: { sort: { field: "total_spend", direction: "asc" } },
    });
    expect(await decide("Only customers who spent over $500")).toEqual({
      type: "refine",
      refinement: { filters: [{ field: "total_spend", op: "gt", value: 500 }] },
    });
    expect(await decide("What share of spending comes from the top 10% of customers?")).toEqual({
      type: "analyze",
      analysis: {
        operation: "concentration",
        measure: "total_spend",
        top_percent: 10,
        target: "complete",
      },
    });
    expect(await decide("Show this as a table")).toEqual({ type: "change_view", view: "table" });
    expect(await decide("Show it as a pie chart")).toEqual({ type: "change_view", view: "pie" });
    expect(await decide("Who spent the most in 2023?")).toMatchObject({
      type: "request_data",
      scope: { start_date: "2023-01-01", end_date: "2024-01-01" },
    });
    expect(await decide("Why did customer spending decline?")).toMatchObject({
      type: "reply",
      reason: "causal",
    });
    expect(await decide("Show product sales instead")).toEqual({
      type: "request_data",
      capability: "product_sales_performance",
    });
    expect(await decide("Yes, switch")).toEqual({ type: "confirm_switch", accept: true });
    expect(await decide("No, keep my current data")).toEqual({
      type: "confirm_switch",
      accept: false,
    });
    expect(await decide("Top-selling products")).toMatchObject({ type: "clarify" });
    expect(await decide("By revenue")).toEqual({
      type: "refine",
      refinement: { sort: { field: "revenue", direction: "desc" } },
    });
    expect(await decide("Only the Jeans category")).toEqual({
      type: "refine",
      refinement: { filters: [{ field: "category", op: "in", values: ["Jeans"] }] },
    });
    // TASK-005 AC-12: a monthly series, a weekly view, a comparison, grouping, and a pie.
    expect(await decide("Show monthly sales for 2025")).toEqual({
      type: "request_data",
      capability: "sales_time_series",
      scope: { start_date: "2025-01-01", end_date: "2026-01-01" },
      refinement: { interval: "month" },
    });
    expect(await decide("Show it by week")).toEqual({
      type: "refine",
      refinement: { interval: "week" },
    });
    expect(await decide("Compare with the previous year")).toEqual({
      type: "request_data",
      capability: "sales_time_series",
      parameters: { comparison: { baseline: "previous_year" } },
    });
    expect(await decide("Which category performed best?")).toEqual({
      type: "refine",
      refinement: { group_by: "category", sort: { field: "revenue", direction: "desc" } },
    });
    // TASK-005 AC-8: grouping is a view setting, not an analysis.
    expect(await decide("Revenue by category")).toEqual({
      type: "refine",
      refinement: { group_by: "category" },
    });
    expect(await decide("What's the weather today?")).toMatchObject({
      type: "reply",
      reason: "unrelated",
    });
  });

  it("answers any other text with the list of examples", async () => {
    expect(await decide("Tell me something interesting")).toEqual({
      type: "reply",
      reason: "other",
      message: ANSWERS.demoUnknown(DEMO_EXAMPLES),
    });
  });
});
