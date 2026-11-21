import { describe, expect, it } from "vitest";
import type { GroupedView, SeriesBucket, SeriesView } from "../engine/result-engine";
import {
  ANSWERS,
  analysisAnswer,
  describeFilters,
  formatCount,
  formatDateRange,
  formatMoney,
  formatPercent,
  groupedAnswer,
  pieAnswer,
  seriesAnswer,
  switchQuestion,
  viewAnswer,
  viewUnsuitableReason,
} from "./answers";

const scope = { start_date: "2025-01-01", end_date: "2026-01-01" };

describe("formatting (AC-10)", () => {
  it.each([
    [0, "$0.00"],
    [35.35, "$35.35"],
    [1234.5, "$1,234.50"],
    [1234567.891, "$1,234,567.89"],
  ])("formats money %d as %s", (value, expected) => {
    expect(formatMoney(value)).toBe(expected);
  });

  it("formats counts with thousands separators and percentages to one decimal", () => {
    expect(formatCount(41862)).toBe("41,862");
    expect(formatPercent(100 / 550)).toBe("18.2%");
    expect(formatPercent(1)).toBe("100.0%");
  });

  it("shows the exclusive end date as the last included day", () => {
    expect(formatDateRange(scope)).toBe("1 Jan 2025 – 31 Dec 2025");
    expect(formatDateRange({ start_date: "2025-03-01", end_date: "2025-03-02" })).toBe(
      "1 Mar 2025",
    );
  });

  it("describes filters in words", () => {
    expect(
      describeFilters("customer_spending", [
        { field: "total_spend", op: "gt", value: 500 },
        { field: "order_count", op: "between", min: 2, max: 5 },
      ]),
    ).toBe("total spend over $500.00, orders between 2 and 5");
    expect(
      describeFilters("product_sales_performance", [
        { field: "category", op: "in", values: ["Jeans", "Shorts"] },
      ]),
    ).toBe("category Jeans or Shorts");
  });
});

describe("answer templates (AC-10)", () => {
  it("describes the displayed result with its base and order", () => {
    expect(
      viewAnswer(
        "customer_spending",
        scope,
        { rowCount: 412, filteredCount: 412, rows: new Array(10) },
        {
          filters: [],
          sort: { field: "total_spend", direction: "desc" },
          limit: 10,
          view: "bar",
        },
      ),
    ).toBe(
      "Showing 10 of 412 customers, 1 Jan 2025 – 31 Dec 2025, by total spend (highest first).",
    );
    expect(
      viewAnswer(
        "customer_spending",
        scope,
        { rowCount: 412, filteredCount: 87, rows: new Array(10) },
        {
          filters: [{ field: "total_spend", op: "gt", value: 500 }],
          sort: { field: "total_spend", direction: "asc" },
          limit: 10,
          view: "table",
        },
      ),
    ).toBe(
      "Showing 10 of 87 customers with total spend over $500.00 (412 in the result), 1 Jan 2025 – 31 Dec 2025, by total spend (lowest first).",
    );
  });

  it("states the base of every analysis, using backend figures only", () => {
    expect(
      analysisAnswer("customer_spending", scope, {
        operation: "concentration",
        target: "complete",
        baseCount: 412,
        measure: "total_spend",
        topRows: 42,
        topTotal: 21000,
        total: 54700,
        share: 21000 / 54700,
      }),
    ).toBe(
      "Based on all 412 customers, 1 Jan 2025 – 31 Dec 2025: the top 42 customers account for 38.4% of total spend ($21,000.00 of $54,700.00).",
    );
    expect(
      analysisAnswer("customer_spending", scope, {
        operation: "summary",
        target: "displayed",
        baseCount: 10,
        field: "total_spend",
        count: 10,
        total: 550,
        average: 55,
        median: 55,
        min: 10,
        max: 100,
      }),
    ).toBe(
      "Based on the 10 displayed customers: total spend totals $550.00, average $55.00, median $55.00, lowest $10.00, highest $100.00.",
    );
  });

  it("says when an analysed set is empty", () => {
    expect(
      analysisAnswer("customer_spending", scope, {
        operation: "summary",
        target: "filtered",
        baseCount: 0,
        field: "total_spend",
        count: 0,
        total: 0,
        average: null,
        median: null,
        min: null,
        max: null,
      }),
    ).toBe("Based on the 0 filtered customers: there are no customers to analyse.");
  });

  describe("sales over time (TASK-005 AC-10)", () => {
    const bucket = (label: string, revenue: number, partial = false): SeriesBucket => ({
      label,
      firstDay: "2025-01-01",
      lastDay: "2025-01-31",
      partial,
      revenue,
      order_count: 1,
      item_count: 1,
    });
    const totals = (revenue: number, order_count = 3, item_count = 4) => ({
      revenue,
      order_count,
      item_count,
    });
    const months = (n: number, partial: number[] = []) =>
      Array.from({ length: n }, (_, i) => bucket(`M${i + 1}`, 1, partial.includes(i)));
    const series = (overrides: Partial<SeriesView> = {}): SeriesView => ({
      interval: "month",
      measure: "revenue",
      main: months(12),
      lengthsDiffer: false,
      totals: { main: totals(35.15) },
      ...overrides,
    });
    const LATER = "2030-01-01";

    it("states the measure, interval, period, bucket count, and total", () => {
      expect(seriesAnswer(scope, {}, series(), LATER)).toBe(
        "Showing revenue by month, 1 Jan 2025 – 31 Dec 2025: 12 months, total $35.15.",
      );
    });

    it("states the product filter and other measures in their units", () => {
      expect(
        seriesAnswer(
          scope,
          { product_filter: { field: "category", values: ["Jeans", "Shorts"] } },
          series({ interval: "week", measure: "order_count", main: months(53) }),
          LATER,
        ),
      ).toBe(
        "Showing orders by week, 1 Jan 2025 – 31 Dec 2025, only Jeans or Shorts: 53 weeks, total 3.",
      );
    });

    it("names the partial buckets", () => {
      expect(seriesAnswer(scope, {}, series({ main: months(12, [0, 11]) }), LATER)).toBe(
        "Showing revenue by month, 1 Jan 2025 – 31 Dec 2025: 12 months, total $35.15. Partial months: M1, M12.",
      );
    });

    it("says when days after today are left out", () => {
      const thisYear = { start_date: "2026-01-01", end_date: "2027-01-01" };
      expect(seriesAnswer(thisYear, {}, series({ main: months(11, [10]) }), "2026-11-08")).toBe(
        "Showing revenue by month, 1 Jan 2026 – 31 Dec 2026: 11 months, total $35.15. Partial months: M11. Days after 8 Nov 2026 are not included yet.",
      );
      // A period ending today needs no note.
      expect(
        seriesAnswer(
          { start_date: "2026-11-01", end_date: "2026-11-09" },
          {},
          series(),
          "2026-11-08",
        ),
      ).not.toContain("not included");
    });

    const lastYear = { comparison: { baseline: "previous_year" as const } };
    /** As the engine gives them: totals and the change for every measure. */
    const compared = (
      main: number,
      earlier: number,
      measure: SeriesView["measure"] = "revenue",
    ) => {
      const change = {
        amount: Math.round((main - earlier) * 100) / 100,
        percent: earlier === 0 ? null : (main - earlier) / earlier,
      };
      return series({
        measure,
        comparison: months(12),
        totals: {
          main: totals(main, main, main),
          comparison: totals(earlier, earlier, earlier),
          change: { revenue: change, order_count: change, item_count: change },
        },
      });
    };
    const noChange = { amount: 0, percent: 0 };

    it.each([
      [150.15, 100.1, "revenue", "total $100.10: up $50.05 (50.0%)."],
      [3, 4, "order_count", "total 4: down 1 (25.0%)."],
      [4, 4, "item_count", "total 4: no change."],
      [12.5, 0, "revenue", "total $0.00: up $12.50 (no percentage, as the earlier total is zero)."],
    ] as const)(
      "states both periods and the change from %d to %d %s, without causal words",
      (main, earlier, measure, ending) => {
        const text = seriesAnswer(scope, lastYear, compared(main, earlier, measure), LATER);
        expect(text).toContain("1 Jan 2025 – 31 Dec 2025");
        expect(text).toContain(`Compared with 1 Jan 2024 – 31 Dec 2024, ${ending}`);
        expect(text).not.toMatch(/because|due to|caused|driven|thanks to|reason/i);
      },
    );

    it("says when the periods differ in length", () => {
      const text = seriesAnswer(
        { start_date: "2025-03-01", end_date: "2025-04-01" },
        { comparison: { baseline: "previous_period" } },
        series({
          interval: "day",
          main: months(31),
          comparison: months(28),
          lengthsDiffer: true,
          totals: {
            main: totals(10),
            comparison: totals(10),
            change: { revenue: noChange, order_count: noChange, item_count: noChange },
          },
        }),
        LATER,
      );
      expect(text).toBe(
        "Showing revenue by day, 1 Mar 2025 – 31 Mar 2025: 31 days, total $10.00. Compared with 1 Feb 2025 – 28 Feb 2025, total $10.00: no change. The periods differ in length (31 and 28 days), so the extra days have no counterpart.",
      );
    });

    it("summarizes per bucket, naming the lowest and highest", () => {
      expect(
        analysisAnswer(
          "sales_time_series",
          scope,
          {
            operation: "summary",
            target: "complete",
            baseCount: 12,
            field: "revenue",
            count: 12,
            total: 120,
            average: 10,
            median: 9.5,
            min: 2,
            max: 30,
            buckets: { interval: "month", lowest: "Feb 2025", highest: "Dec 2025" },
          },
          { product_filter: { field: "department", values: ["Women"] } },
        ),
      ).toBe(
        "Based on all 12 months, 1 Jan 2025 – 31 Dec 2025, only Women: revenue totals $120.00, average $10.00 per month, median $9.50, lowest $2.00 (Feb 2025), highest $30.00 (Dec 2025).",
      );
    });

    it("names what changes between two series in the switch question", () => {
      expect(
        switchQuestion(
          { capability: "sales_time_series", scope, parameters: {} },
          { capability: "sales_time_series", scope, parameters: lastYear },
        ),
      ).toBe(
        "Your current result covers sales over time for 1 Jan 2025 – 31 Dec 2025. This question needs new data: adds a comparison with 1 Jan 2024 – 31 Dec 2024. Would you like to explore anything further from your current dataset, or should I switch to the new dataset?",
      );
    });
  });

  describe("grouped view and pie (TASK-005 AC-10)", () => {
    const g = (key: string, revenue: number) => ({ key, product_count: 1, revenue, item_count: 1 });
    const grouped = (overrides: Partial<GroupedView> = {}): GroupedView => ({
      groupBy: "category",
      groupCount: 3,
      rowCount: 10,
      filteredCount: 10,
      groups: [g("A", 3), g("B", 2), g("C", 1)],
      other: null,
      ...overrides,
    });
    const view = (overrides: object = {}) => ({
      filters: [],
      sort: { field: "revenue", direction: "desc" as const },
      limit: 10,
      view: "bar" as const,
      group_by: "category" as const,
      ...overrides,
    });

    it("states the dimension and the groups shown", () => {
      expect(groupedAnswer("product_sales_performance", scope, grouped(), view())).toBe(
        "Showing 3 categories by revenue (highest first), 1 Jan 2025 – 31 Dec 2025.",
      );
    });

    it("states the filters applied before grouping", () => {
      expect(
        groupedAnswer(
          "product_sales_performance",
          scope,
          grouped({ groupBy: "department", groupCount: 1, groups: [g("Men", 5)] }),
          view({
            group_by: "department",
            sort: { field: "item_count", direction: "asc" },
            filters: [{ field: "category", op: "in", values: ["Jeans"] }],
          }),
        ),
      ).toBe(
        "Showing 1 department by items sold (lowest first), 1 Jan 2025 – 31 Dec 2025, products with category Jeans.",
      );
    });

    it('states the brands shown and how many are combined as "Other"', () => {
      expect(
        groupedAnswer(
          "product_sales_performance",
          scope,
          grouped({
            groupBy: "brand",
            groupCount: 2756,
            groups: Array.from({ length: 20 }, (_, i) => g(`B${i}`, 1)),
            other: { ...g("Other", 1), key: "Other", groups: 2736 },
          }),
          view({ group_by: "brand", groupLimit: 20 }),
        ),
      ).toBe(
        'Showing the top 20 of 2,756 brands by revenue (highest first), 1 Jan 2025 – 31 Dec 2025; 2,736 other brands are combined as "Other".',
      );
    });

    it("states the pie's slice rule", () => {
      const slice = (key: string) => ({ ...g(key, 1), share: 0.1 });
      expect(
        pieAnswer(
          "product_sales_performance",
          grouped({ pie: { measure: "revenue", slices: [slice("A"), slice("B")], other: null } }),
        ),
      ).toBe("Showing the result as a pie chart of 2 categories by revenue.");
      expect(
        pieAnswer(
          "product_sales_performance",
          grouped({
            groupCount: 26,
            pie: {
              measure: "item_count",
              slices: ["A", "B", "C", "D", "E"].map(slice),
              other: { ...slice("Other"), key: "Other", groups: 21 },
            },
          }),
        ),
      ).toBe(
        'Showing the result as a pie chart of the 5 largest categories by items sold; the other 21 are combined as "Other".',
      );
    });

    it("refuses an unsuitable or unknown view with the reason and the suitable views", () => {
      expect(
        ANSWERS.viewUnsuitable("pie", viewUnsuitableReason("series", "pie", "sales_time_series"), [
          "line",
          "bar",
          "table",
        ]),
      ).toBe(
        "A pie chart doesn't suit this result: sales over time is shown in date order. I can show it as a line chart, a bar chart, or a table.",
      );
      expect(ANSWERS.viewUnsupported("Radar chart", ["bar", "table"])).toBe(
        "Radar charts aren't available. I can show it as a bar chart or a table.",
      );
    });
  });

  it("uses the requirements document's wording for a switch", () => {
    expect(
      switchQuestion(
        { capability: "customer_spending", scope },
        { capability: "product_sales_performance", scope },
      ),
    ).toBe(
      "Your current result covers customer spending for 1 Jan 2025 – 31 Dec 2025. This question needs product sales performance for 1 Jan 2025 – 31 Dec 2025. Would you like to explore anything further from your current dataset, or should I switch to the new dataset?",
    );
  });
});
