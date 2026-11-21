import { describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  DEFAULT_VIEW,
  DEPARTMENTS,
  MAX_PIE_SLICES,
  THELOOK_CATEGORIES,
  VIEWS_BY_SHAPE,
  normalizeViewName,
  seriesDefaultInterval,
  comparisonPeriod,
  defaultInterval,
  getCapability,
  validateAnalysis,
  validateRefinement,
  validateRequestParameters,
  validateScope,
} from "./registry";

const categories = ["Jeans", "Outerwear & Coats", "Sweaters"];

describe("capability registry (AC-2)", () => {
  it("defines the two TASK-003 capabilities and TASK-005's sales over time, with their fields", () => {
    expect(Object.keys(CAPABILITIES).sort()).toEqual([
      "customer_spending",
      "product_sales_performance",
      "sales_time_series",
    ]);
    expect(getCapability("sales_time_series")?.fields.map((f) => f.name)).toEqual([
      "date",
      "revenue",
      "order_count",
      "item_count",
    ]);
    expect(getCapability("sales_time_series")?.rowCap).toBe(4_000);
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
      "department",
      "brand",
      "revenue",
      "item_count",
    ]);
    expect(getCapability("repeat_purchase_behavior")).toBeUndefined();
  });

  it("makes department and brand categorical product fields (TASK-005 AC-2)", () => {
    const fields = CAPABILITIES.product_sales_performance.fields;
    expect(fields.find((f) => f.name === "department")?.kind).toBe("category");
    expect(fields.find((f) => f.name === "brand")?.kind).toBe("category");
  });

  it("lists brand values for the backend only; the model gets their number (TASK-005 AC-2)", () => {
    const fields = CAPABILITIES.product_sales_performance.fields;
    expect(fields.find((f) => f.name === "brand")?.listValues).toBe(false);
    expect(fields.find((f) => f.name === "category")?.listValues).toBeUndefined();
    expect(fields.find((f) => f.name === "department")?.listValues).toBeUndefined();
  });

  it("validates a brand filter against the stored values without listing them (TASK-005 AC-2)", () => {
    const allowed = { category: categories, department: ["Men", "Women"], brand: ["Northline"] };
    expect(
      validateRefinement(
        "product_sales_performance",
        { filters: [{ field: "brand", op: "in", values: ["Northline"] }] },
        allowed,
      ).ok,
    ).toBe(true);
    for (const values of [["Southline"], []]) {
      const result = validateRefinement(
        "product_sales_performance",
        { filters: [{ field: "brand", op: "in", values }] },
        allowed,
      );
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.issue.field).toBe("brand");
      expect(result.issue.validOptions).toBeUndefined();
      expect(result.issue.message).not.toContain("Northline");
    }
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

describe("time-series request (TASK-005 AC-3, DEC-002)", () => {
  const scope = (start_date: string, end_date: string) => ({ start_date, end_date });
  const y2025 = scope("2025-01-01", "2026-01-01");
  const check = (
    parameters?: object,
    refinement?: object,
    period = y2025,
    capability = "sales_time_series",
  ) => validateRequestParameters(capability, period, parameters as never, refinement as never);
  const issue = (result: ReturnType<typeof check>) => (result.ok ? null : result.issue);

  it.each([
    ["2025-01-01", "2025-02-01", "day"], // 31 days
    ["2025-01-01", "2025-02-02", "week"], // 32 days
    ["2025-01-01", "2025-04-03", "week"], // 92 days
    ["2025-01-01", "2025-04-04", "month"], // 93 days
    ["2021-01-01", "2026-01-01", "month"],
  ] as const)("defaults %s to %s to a %s interval", (start, end, interval) => {
    expect(defaultInterval(scope(start, end))).toBe(interval);
  });

  it("accepts a request without parameters, with the default interval and revenue", () => {
    expect(check()).toEqual({ ok: true, parameters: {}, interval: "month", measure: "revenue" });
  });

  it("accepts a filter, a comparison, an interval, and a measure", () => {
    const parameters = {
      product_filter: { field: "category", values: ["Jeans"] },
      comparison: { baseline: "custom", start_date: "2024-01-01", end_date: "2025-01-01" },
    };
    expect(check(parameters, { interval: "week", measure: "item_count" })).toEqual({
      ok: true,
      parameters,
      interval: "week",
      measure: "item_count",
    });
  });

  it("allows days up to 366 days and offers week or month beyond", () => {
    expect(check(undefined, { interval: "day" }, scope("2024-01-01", "2025-01-01")).ok).toBe(true);
    expect(
      issue(check(undefined, { interval: "day" }, scope("2024-01-01", "2025-01-02"))),
    ).toMatchObject({
      code: "invalid_value",
      field: "interval",
      validOptions: ["week", "month"],
    });
  });

  it("applies the day limit to a custom comparison period too", () => {
    // 367 days (2023 is not a leap year).
    const comparison = { baseline: "custom", start_date: "2023-01-01", end_date: "2024-01-03" };
    expect(
      issue(check({ comparison }, { interval: "day" }, scope("2025-01-01", "2025-02-01")))?.field,
    ).toBe("interval");
  });

  it.each([
    ["an unknown category", { field: "category", values: ["Denim"] }, THELOOK_CATEGORIES],
    ["an unknown department", { field: "department", values: ["Kids"] }, DEPARTMENTS],
  ])("refuses %s, listing the profiled values", (_, product_filter, options) => {
    expect(issue(check({ product_filter }))).toMatchObject({
      code: "value_not_allowed",
      field: product_filter.field,
      validOptions: options,
    });
  });

  it("refuses an empty filter", () => {
    expect(issue(check({ product_filter: { field: "category", values: [] } }))?.code).toBe(
      "missing_value",
    );
  });

  it.each([
    ["an end before the start", { start_date: "2024-06-01", end_date: "2024-01-01" }],
    ["more than 5 years", { start_date: "2015-01-01", end_date: "2024-01-01" }],
    ["missing dates", {}],
  ])("refuses a custom comparison with %s", (_, dates) => {
    expect(issue(check({ comparison: { baseline: "custom", ...dates } }))?.field).toBe(
      "comparison",
    );
  });

  it("refuses a measure the series does not have", () => {
    expect(issue(check(undefined, { measure: "total_spend" }))).toMatchObject({
      field: "measure",
      validOptions: ["revenue", "order_count", "item_count"],
    });
  });

  it("knows all 26 profiled categories and both departments", () => {
    expect(THELOOK_CATEGORIES).toHaveLength(26);
    expect(DEPARTMENTS).toEqual(["Men", "Women"]);
  });

  describe("other capabilities", () => {
    it("accept no parameters, interval, or measure", () => {
      expect(check(undefined, undefined, y2025, "product_sales_performance")).toEqual({
        ok: true,
        parameters: {},
      });
      const refused: [object | undefined, object | undefined][] = [
        [{ comparison: { baseline: "previous_year" } }, undefined],
        [undefined, { interval: "week" }],
        [undefined, { measure: "revenue" }],
      ];
      for (const [parameters, refinement] of refused) {
        expect(
          issue(check(parameters, refinement, y2025, "product_sales_performance"))?.message,
        ).toContain("sales over time");
      }
    });

    it("refuse interval and measure in a later refinement", () => {
      for (const refinement of [{ interval: "week" }, { measure: "revenue" }]) {
        const result = validateRefinement("customer_spending", refinement as never, {});
        expect(result.ok ? null : result.issue.message).toContain("sales over time");
      }
    });

    // DEC-003 follow-up: "top 10 brands by revenue" arrives as a measure; say what does work. A
    // brand count also arrives as a measure (walkthrough), so the reply must not suggest one.
    it("explain how to rank product results instead, without suggesting a brand count", () => {
      const result = validateRefinement(
        "product_sales_performance",
        { group_by: "brand", interval: "day", measure: "revenue" } as never,
        {},
      );
      const message = result.ok ? null : result.issue.message;
      expect(message).toBe(
        "Intervals and measures apply only to sales over time. To rank products, ask to sort by revenue or items sold. Grouped by brand, the top 20 brands are shown, with the rest combined as Other.",
      );
      expect(message).not.toMatch(/show 10 brands/);
    });

    it("explain how to rank customer results instead", () => {
      const result = validateRefinement("customer_spending", { measure: "revenue" } as never, {});
      expect(result.ok ? null : result.issue.message).toBe(
        "Intervals and measures apply only to sales over time. To rank customers, ask to sort by total spend, orders, or avg order value.",
      );
    });
  });
});

describe("comparison period (TASK-005 AC-4, S8)", () => {
  const scope = (start_date: string, end_date: string) => ({ start_date, end_date });

  it.each([
    // Whole calendar months: the same number of months immediately before.
    ["2025-01-01", "2026-01-01", "2024-01-01", "2025-01-01"],
    ["2025-03-01", "2025-04-01", "2025-02-01", "2025-03-01"], // March after February
    ["2026-01-01", "2026-04-01", "2025-10-01", "2026-01-01"], // across a year boundary
    // Otherwise: the same number of days immediately before.
    ["2025-03-10", "2025-03-17", "2025-03-03", "2025-03-10"],
    ["2024-03-01", "2024-03-15", "2024-02-16", "2024-03-01"], // across a leap February
  ])("previous period of %s to %s is %s to %s", (start, end, prevStart, prevEnd) => {
    expect(comparisonPeriod(scope(start, end), { baseline: "previous_period" })).toEqual(
      scope(prevStart, prevEnd),
    );
  });

  it.each([
    ["2025-01-01", "2026-01-01", "2024-01-01", "2025-01-01"],
    ["2024-02-29", "2024-03-10", "2023-02-28", "2023-03-10"], // leap day
    ["2025-12-15", "2026-01-15", "2024-12-15", "2025-01-15"],
  ])("previous year of %s to %s is %s to %s", (start, end, prevStart, prevEnd) => {
    expect(comparisonPeriod(scope(start, end), { baseline: "previous_year" })).toEqual(
      scope(prevStart, prevEnd),
    );
  });

  it("uses custom dates as given", () => {
    expect(
      comparisonPeriod(scope("2025-01-01", "2026-01-01"), {
        baseline: "custom",
        start_date: "2023-03-01",
        end_date: "2023-06-01",
      }),
    ).toEqual(scope("2023-03-01", "2023-06-01"));
  });

  // Task review S-1: an exclusive end of 29 Feb means the period ends on 28 Feb; the previous year
  // must end on 28 Feb too (exclusive end 1 Mar), not drop a day.
  it("keeps the last day when a previous-year period has an exclusive end of 29 Feb", () => {
    expect(
      comparisonPeriod(scope("2027-03-01", "2028-02-29"), { baseline: "previous_year" }),
    ).toEqual(scope("2026-03-01", "2027-03-01"));
  });

  describe("interval fallback (task review SF-1)", () => {
    const short = scope("2025-01-01", "2025-01-21"); // 20 days: default "day"
    const longComparison = {
      comparison: { baseline: "custom" as const, start_date: "2022-01-01", end_date: "2024-01-01" },
    };

    it("checks a measure-only refinement against the current view's interval", () => {
      expect(
        validateRequestParameters(
          "sales_time_series",
          short,
          longComparison,
          {
            measure: "order_count",
          },
          "month",
        ).ok,
      ).toBe(true);
    });

    it("defaults to the interval of the longer period, so a long comparison never defaults to days", () => {
      const result = validateRequestParameters(
        "sales_time_series",
        short,
        longComparison,
        undefined,
      );
      expect(result).toMatchObject({ ok: true, interval: "month" });
      expect(seriesDefaultInterval(short, longComparison)).toBe("month");
      expect(seriesDefaultInterval(short, {})).toBe("day");
    });

    it("still refuses daily figures the user asks for over a long comparison", () => {
      const result = validateRequestParameters("sales_time_series", short, longComparison, {
        interval: "day",
      });
      expect(result.ok ? null : result.issue.field).toBe("interval");
    });
  });

  it("applies the day limit to a previous-year period that gains a leap day", () => {
    // 366 days; shifted back a year it spans 29 Feb 2024 and has 367 days.
    const result = validateRequestParameters(
      "sales_time_series",
      scope("2025-01-02", "2026-01-03"),
      { comparison: { baseline: "previous_year" } },
      { interval: "day" },
    );
    expect(result.ok ? null : result.issue.field).toBe("interval");
  });
});

describe("what applies to a time series (TASK-005 AC-7)", () => {
  const refine = (refinement: object, interval?: "day" | "week" | "month") =>
    validateRefinement("sales_time_series", refinement, {}, interval ? { interval } : {});

  it.each([
    ["an interval", { interval: "week" }],
    ["a measure", { measure: "order_count" }],
    ["clearing filters", { clear_filters: true }],
    ["no grouping", { group_by: "none" }],
  ])("allows %s", (_, refinement) => {
    expect(refine(refinement).ok).toBe(true);
  });

  it.each([
    ["sorting by value", { sort: { field: "revenue", direction: "desc" } }, "sort"],
    ["a row limit", { limit: 5 }, "limit"],
  ])(
    "refuses %s: shown in date order, ask for the highest bucket instead",
    (_, refinement, field) => {
      const result = refine(refinement, "month");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.issue.field).toBe(field);
      expect(result.issue.message).toBe(
        "Sales over time is shown in date order. Ask for the highest or lowest month instead.",
      );
    },
  );

  it("names the bucket of the requested interval in the refusal", () => {
    const result = refine({ limit: 3, interval: "week" }, "month");
    expect(result.ok ? null : result.issue.message).toContain("highest or lowest week");
  });

  it("refuses a measure filter with an alternative", () => {
    const result = refine({ filters: [{ field: "revenue", op: "gt", value: 100 }] }, "day");
    expect(result.ok ? null : result.issue).toMatchObject({
      field: "filters",
      message:
        "Sales over time shows every day, so it can't be filtered by value. Ask for the highest or lowest day instead.",
    });
  });

  it.each(["category", "department", "brand"])("refuses grouping by %s", (groupBy) => {
    const result = refine({ group_by: groupBy });
    expect(result.ok ? null : result.issue).toMatchObject({
      field: "group_by",
      message:
        "Sales over time can't be grouped. Ask for product sales grouped by category, department, or brand instead.",
    });
  });

  it.each(["revenue", "order_count", "item_count"])("allows a summary of %s", (field) => {
    expect(
      validateAnalysis("sales_time_series", { operation: "summary", field, target: "complete" }).ok,
    ).toBe(true);
  });

  it("refuses a summary of a non-measure field", () => {
    const result = validateAnalysis("sales_time_series", {
      operation: "summary",
      field: "date",
      target: "complete",
    });
    expect(result.ok).toBe(false);
  });

  it("refuses concentration with an alternative", () => {
    const result = validateAnalysis("sales_time_series", {
      operation: "concentration",
      measure: "revenue",
      top_percent: 10,
      target: "complete",
    });
    expect(result.ok ? null : result.issue.message).toBe(
      "Concentration compares customers or products, not sales over time. Ask for a summary to see the lowest and highest periods instead.",
    );
  });
});

describe("views and chart rules (TASK-005 AC-9)", () => {
  it.each([
    ["bar", "bar"],
    ["Bar chart", "bar"],
    ["columns", "bar"],
    ["horizontal_bar", "horizontal_bar"],
    ["horizontal bars", "horizontal_bar"],
    ["Horizontal bar chart", "horizontal_bar"],
    ["horizontal-bar graph", "horizontal_bar"],
    ["line", "line"],
    ["line chart", "line"],
    ["Pie chart", "pie"],
    ["  table ", "table"],
    ["scatter plot", null],
    ["", null],
  ])("normalizes %j to %s", (text, view) => {
    expect(normalizeViewName(text)).toBe(view);
  });

  it("offers the views that suit each result shape, and starts each in its default", () => {
    expect(VIEWS_BY_SHAPE).toEqual({
      rows: ["bar", "horizontal_bar", "table"],
      groups: ["bar", "horizontal_bar", "pie", "table"],
      series: ["line", "bar", "table"],
    });
    expect(DEFAULT_VIEW).toEqual({ rows: "bar", groups: "bar", series: "line" });
    expect(MAX_PIE_SLICES).toBe(6);
  });
});

describe("grouped view of product results (TASK-005 AC-8)", () => {
  const product = (refinement: object, current: object = {}) =>
    validateRefinement("product_sales_performance", refinement, {}, current);

  it("offers category, department, and brand as product groupings", () => {
    expect(CAPABILITIES.product_sales_performance.groupByFields).toEqual([
      "category",
      "department",
      "brand",
    ]);
    expect(CAPABILITIES.customer_spending.groupByFields).toEqual([]);
  });

  it.each<[string, object, object?]>([
    ["category", { group_by: "category" }],
    ["department", { group_by: "department" }],
    ["brand", { group_by: "brand" }],
    ["brand with a number", { group_by: "brand", limit: 30 }],
    ["no grouping", { group_by: "none" }],
    ["a brand number while grouped by brand", { limit: 1 }, { group_by: "brand" }],
    ["a product row limit when not grouped", { limit: 100 }],
  ])("allows %s", (_, refinement, current = {}) => {
    expect(product(refinement, current).ok).toBe(true);
  });

  it.each([
    [{ group_by: "brand", limit: 31 }, {}],
    [{ group_by: "brand", limit: 0 }, {}],
    [{ limit: 31 }, { group_by: "brand" }],
  ])("refuses a brand number outside 1–30 (%j while %j)", (refinement, current) => {
    expect(product(refinement, current)).toMatchObject({
      ok: false,
      issue: { field: "limit", message: "Show between 1 and 30 brands." },
    });
  });

  it.each([
    [{ group_by: "category", limit: 5 }, {}, "category"],
    [{ limit: 5 }, { group_by: "department" }, "department"],
  ])(
    "refuses a number of groups for %j while %j: every group is shown",
    (refinement, current, dim) => {
      expect(product(refinement, current)).toMatchObject({
        ok: false,
        issue: { field: "limit", message: `Every ${dim} is shown when grouped by ${dim}.` },
      });
    },
  );

  it("refuses grouping customers, with an alternative", () => {
    expect(validateRefinement("customer_spending", { group_by: "category" }, {})).toMatchObject({
      ok: false,
      issue: {
        field: "group_by",
        message:
          "Customer spending can't be grouped. Ask for product sales grouped by category, department, or brand instead.",
      },
    });
  });

  it("allows no grouping for customers", () => {
    expect(validateRefinement("customer_spending", { group_by: "none" }, {}).ok).toBe(true);
  });
});
