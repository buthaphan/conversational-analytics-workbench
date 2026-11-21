import { describe, expect, it } from "vitest";
import { TIME_SERIES_ROW_CAP } from "../capabilities/registry";
import { DataSource, type ResultRowData } from "./data-source";
import {
  type DailySalesRequest,
  type DailySalesRow,
  completeDailySeries,
  seriesPeriods,
} from "./time-series";

const day = (
  date: string,
  revenue: number,
  orders = 1,
  items = 1,
  period: DailySalesRow["period"] = "main",
): DailySalesRow => ({ period, date, revenue, order_count: orders, item_count: items });
const zero = (date: string, period: DailySalesRow["period"] = "main") => day(date, 0, 0, 0, period);

const january = { start_date: "2025-01-01", end_date: "2025-01-06" };

describe("time-series periods (TASK-005 AC-4)", () => {
  it("has only the main period without a comparison", () => {
    expect(seriesPeriods(january, {})).toEqual([{ period: "main", scope: january }]);
  });

  it("adds the comparison period computed from the baseline", () => {
    expect(seriesPeriods(january, { comparison: { baseline: "previous_year" } })).toEqual([
      { period: "main", scope: january },
      { period: "comparison", scope: { start_date: "2024-01-01", end_date: "2024-01-06" } },
    ]);
  });

  it("uses custom comparison dates as given", () => {
    const comparison = { baseline: "custom", start_date: "2023-03-01", end_date: "2023-03-04" };
    expect(seriesPeriods(january, { comparison } as never)[1]).toEqual({
      period: "comparison",
      scope: { start_date: "2023-03-01", end_date: "2023-03-04" },
    });
  });
});

describe("completing a daily series (TASK-005 AC-4, S7)", () => {
  const main = [{ period: "main" as const, scope: january }];

  it("fills days without sales with zeros, in date order", () => {
    const rows = [day("2025-01-04", 7.5, 2, 3), day("2025-01-02", 10)];
    expect(completeDailySeries(rows, main, "2025-12-31")).toEqual([
      zero("2025-01-01"),
      day("2025-01-02", 10),
      zero("2025-01-03"),
      day("2025-01-04", 7.5, 2, 3),
      zero("2025-01-05"),
    ]);
  });

  it("keeps today and drops the days after it, including future-dated sales", () => {
    const rows = [day("2025-01-03", 4), day("2025-01-04", 9)];
    expect(completeDailySeries(rows, main, "2025-01-03")).toEqual([
      zero("2025-01-01"),
      zero("2025-01-02"),
      day("2025-01-03", 4),
    ]);
  });

  it("returns no days for a period that starts after today", () => {
    expect(completeDailySeries([], main, "2024-12-31")).toEqual([]);
  });

  it("completes each period separately, main period first", () => {
    const periods = [
      { period: "main" as const, scope: { start_date: "2025-01-01", end_date: "2025-01-03" } },
      {
        period: "comparison" as const,
        scope: { start_date: "2024-01-01", end_date: "2024-01-03" },
      },
    ];
    const rows = [day("2024-01-02", 3, 1, 1, "comparison"), day("2025-01-01", 5)];
    expect(completeDailySeries(rows, periods, "2025-06-01")).toEqual([
      day("2025-01-01", 5),
      zero("2025-01-02"),
      zero("2024-01-01", "comparison"),
      day("2024-01-02", 3, 1, 1, "comparison"),
    ]);
  });

  it("allows a comparison period that overlaps the main period", () => {
    const periods = [
      { period: "main" as const, scope: { start_date: "2025-01-01", end_date: "2025-01-03" } },
      {
        period: "comparison" as const,
        scope: { start_date: "2025-01-02", end_date: "2025-01-04" },
      },
    ];
    const rows = [day("2025-01-02", 5), day("2025-01-02", 5, 1, 1, "comparison")];
    expect(completeDailySeries(rows, periods, "2025-06-01")).toEqual([
      zero("2025-01-01"),
      day("2025-01-02", 5),
      day("2025-01-02", 5, 1, 1, "comparison"),
      zero("2025-01-03", "comparison"),
    ]);
  });

  it("crosses a month end and a leap day", () => {
    const leap = [
      { period: "main" as const, scope: { start_date: "2024-02-28", end_date: "2024-03-02" } },
    ];
    expect(completeDailySeries([], leap, "2025-01-01").map((r) => r.date)).toEqual([
      "2024-02-28",
      "2024-02-29",
      "2024-03-01",
    ]);
  });

  it.each([
    ["a day before the period", [day("2024-12-31", 1)]],
    ["the end date (exclusive)", [day("2025-01-06", 1)]],
    ["a period that was not requested", [day("2025-01-02", 1, 1, 1, "comparison")]],
    ["the same day twice", [day("2025-01-02", 1), day("2025-01-02", 2)]],
  ])("refuses an adapter row for %s", (_case, rows) => {
    expect(() => completeDailySeries(rows, main, "2025-12-31")).toThrow();
  });
});

/** Answers with canned adapter rows and records the request. */
class CannedSource extends DataSource {
  requests: DailySalesRequest[] = [];
  constructor(private readonly rows: DailySalesRow[]) {
    super();
  }
  async fetch(): Promise<ResultRowData[]> {
    return [];
  }
  async fetchDailySales(request: DailySalesRequest): Promise<DailySalesRow[]> {
    this.requests.push(request);
    return this.rows;
  }
}

describe("DataSource.fetchTimeSeries (TASK-005 AC-4)", () => {
  it("asks the adapter for both periods and the filter, then completes the series", async () => {
    const source = new CannedSource([day("2025-01-02", 10)]);
    const productFilter = { field: "category" as const, values: ["Jeans"] };
    const rows = await source.fetchTimeSeries(
      { start_date: "2025-01-01", end_date: "2025-01-03" },
      { product_filter: productFilter, comparison: { baseline: "previous_period" } },
      "2025-12-31",
    );
    expect(source.requests).toEqual([
      {
        periods: [
          { period: "main", scope: { start_date: "2025-01-01", end_date: "2025-01-03" } },
          { period: "comparison", scope: { start_date: "2024-12-30", end_date: "2025-01-01" } },
        ],
        productFilter,
      },
    ]);
    expect(rows).toEqual([
      zero("2025-01-01"),
      day("2025-01-02", 10),
      zero("2024-12-30", "comparison"),
      zero("2024-12-31", "comparison"),
    ]);
  });

  it("sends no filter when there is none", async () => {
    const source = new CannedSource([]);
    await source.fetchTimeSeries(january, {}, "2025-12-31");
    expect(source.requests[0]).toEqual({ periods: [{ period: "main", scope: january }] });
  });

  it("returns an over-cap adapter result unchanged, so the orchestrator refuses it (TASK-004 AC-11)", async () => {
    const many = Array.from({ length: TIME_SERIES_ROW_CAP + 1 }, () => day("2025-01-02", 1));
    const rows = await new CannedSource(many).fetchTimeSeries(january, {}, "2025-12-31");
    expect(rows).toHaveLength(TIME_SERIES_ROW_CAP + 1);
  });

  it("allows both periods at the 5-year maximum under the row cap", () => {
    expect(TIME_SERIES_ROW_CAP).toBeGreaterThanOrEqual(2 * 1827);
  });
});
