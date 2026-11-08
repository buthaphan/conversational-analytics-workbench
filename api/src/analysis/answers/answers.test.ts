import { describe, expect, it } from "vitest";
import {
  analysisAnswer,
  describeFilters,
  formatCount,
  formatDateRange,
  formatMoney,
  formatPercent,
  switchQuestion,
  viewAnswer,
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
