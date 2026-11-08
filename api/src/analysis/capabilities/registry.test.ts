import { describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  getCapability,
  validateAnalysis,
  validateRefinement,
  validateScope,
} from "./registry";

const categories = ["Jeans", "Outerwear & Coats", "Sweaters"];

describe("capability registry (AC-2)", () => {
  it("defines exactly the two TASK-003 capabilities with their fields", () => {
    expect(Object.keys(CAPABILITIES).sort()).toEqual([
      "customer_spending",
      "product_sales_performance",
    ]);
    expect(getCapability("customer_spending")?.fields.map((f) => f.name)).toEqual([
      "customer_id",
      "customer_name",
      "total_spend",
      "order_count",
      "avg_order_value",
    ]);
    expect(getCapability("product_sales_performance")?.fields.map((f) => f.name)).toEqual([
      "product_id",
      "product_name",
      "category",
      "revenue",
      "item_count",
    ]);
    expect(getCapability("sales_time_series")).toBeUndefined();
  });

  it("gives every field a meaning and a unit-bearing kind for the model context", () => {
    for (const capability of Object.values(CAPABILITIES)) {
      expect(capability.description.length).toBeGreaterThan(40);
      for (const field of capability.fields) {
        expect(field.description.length, field.name).toBeGreaterThan(10);
        expect(["id", "label", "money", "integer", "category"]).toContain(field.kind);
      }
    }
  });

  describe("scope", () => {
    it("accepts a valid date range (end exclusive)", () => {
      expect(validateScope({ start_date: "2025-01-01", end_date: "2026-01-01" })).toEqual({
        ok: true,
        scope: { start_date: "2025-01-01", end_date: "2026-01-01" },
      });
    });

    it.each([
      ["missing end", { start_date: "2025-01-01" }, "missing_value"],
      ["not a date", { start_date: "2025-13-01", end_date: "2026-01-01" }, "invalid_value"],
      ["wrong format", { start_date: "01/01/2025", end_date: "2026-01-01" }, "invalid_value"],
      [
        "end not after start",
        { start_date: "2025-01-01", end_date: "2025-01-01" },
        "invalid_value",
      ],
      ["more than 5 years", { start_date: "2020-01-01", end_date: "2025-01-02" }, "invalid_value"],
    ])("rejects %s", (_, scope, code) => {
      const result = validateScope(scope);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.issue.code).toBe(code);
    });
  });

  describe("refinements", () => {
    it("accepts numeric filters, sort, and limit on allowed fields", () => {
      const result = validateRefinement(
        "customer_spending",
        {
          filters: [
            { field: "total_spend", op: "gt", value: 500 },
            { field: "order_count", op: "between", min: 2, max: 5 },
          ],
          sort: { field: "total_spend", direction: "asc" },
          limit: 20,
        },
        {},
      );
      expect(result.ok).toBe(true);
    });

    it("accepts a category filter only with allowed values", () => {
      expect(
        validateRefinement(
          "product_sales_performance",
          { filters: [{ field: "category", op: "in", values: ["Jeans"] }] },
          { category: categories },
        ).ok,
      ).toBe(true);
      const bad = validateRefinement(
        "product_sales_performance",
        { filters: [{ field: "category", op: "in", values: ["Denim"] }] },
        { category: categories },
      );
      expect(bad).toMatchObject({
        ok: false,
        issue: { code: "value_not_allowed", field: "category", validOptions: categories },
      });
    });

    it.each([
      ["unknown field", { filters: [{ field: "region", op: "gt", value: 1 }] }, "unknown_field"],
      [
        "non-numeric field with a numeric operator",
        { filters: [{ field: "customer_name", op: "gt", value: 1 }] },
        "invalid_operator",
      ],
      ["missing value", { filters: [{ field: "total_spend", op: "gt" }] }, "missing_value"],
      [
        "between without max",
        { filters: [{ field: "total_spend", op: "between", min: 1 }] },
        "missing_value",
      ],
      [
        "between with min above max",
        { filters: [{ field: "total_spend", op: "between", min: 9, max: 1 }] },
        "invalid_value",
      ],
      [
        "sort by a label",
        { sort: { field: "customer_name", direction: "asc" } },
        "invalid_operator",
      ],
      ["limit 0", { limit: 0 }, "invalid_value"],
      ["limit 101", { limit: 101 }, "invalid_value"],
    ])("rejects %s", (_, refinement, code) => {
      const result = validateRefinement("customer_spending", refinement as never, {});
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.issue.code).toBe(code);
    });
  });

  describe("analyses", () => {
    it.each([
      ["customer_spending", { operation: "summary", field: "avg_order_value", target: "complete" }],
      [
        "customer_spending",
        { operation: "concentration", measure: "total_spend", top_percent: 10, target: "complete" },
      ],
      [
        "product_sales_performance",
        { operation: "concentration", measure: "item_count", top_count: 10, target: "displayed" },
      ],
      [
        "product_sales_performance",
        { operation: "group", group_by: "category", target: "filtered" },
      ],
    ])("accepts %s %j", (capability, analysis) => {
      expect(validateAnalysis(capability as never, analysis as never).ok).toBe(true);
    });

    it.each([
      ["customer_spending", { operation: "summary", target: "complete" }, "missing_value"],
      [
        "customer_spending",
        { operation: "summary", field: "customer_name", target: "complete" },
        "invalid_operator",
      ],
      [
        "customer_spending",
        {
          operation: "concentration",
          measure: "avg_order_value",
          top_percent: 10,
          target: "complete",
        },
        "invalid_operator",
      ],
      [
        "customer_spending",
        { operation: "group", group_by: "category", target: "complete" },
        "unknown_field",
      ],
      [
        "customer_spending",
        { operation: "concentration", measure: "total_spend", top_percent: 0, target: "complete" },
        "invalid_value",
      ],
      [
        "customer_spending",
        {
          operation: "concentration",
          measure: "total_spend",
          top_percent: 101,
          target: "complete",
        },
        "invalid_value",
      ],
      // Review R3: an unbounded count would overflow the SQL cast and fail the whole turn.
      [
        "customer_spending",
        { operation: "concentration", measure: "total_spend", top_count: 1e20, target: "complete" },
        "invalid_value",
      ],
      [
        "customer_spending",
        {
          operation: "concentration",
          measure: "total_spend",
          top_count: 100_001,
          target: "complete",
        },
        "invalid_value",
      ],
    ])("rejects %s %j", (capability, analysis, code) => {
      const result = validateAnalysis(capability as never, analysis as never);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.issue.code).toBe(code);
    });
  });

  describe("row caps (TASK-004 AC-8, N2)", () => {
    it("sets each capability's cap from the TheLook profile (docs/product/THELOOK-PROFILE.md)", () => {
      expect(CAPABILITIES.customer_spending.rowCap).toBe(50_000);
      expect(CAPABILITIES.product_sales_performance.rowCap).toBe(50_000);
    });

    it("bounds top_count by the registry cap", () => {
      const at = (top_count: number) =>
        validateAnalysis("customer_spending", {
          operation: "concentration",
          measure: "total_spend",
          top_count,
          target: "complete",
        }).ok;
      expect(at(50_000)).toBe(true);
      expect(at(50_001)).toBe(false);
    });
  });
});
