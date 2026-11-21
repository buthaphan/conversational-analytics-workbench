import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Interval } from "../capabilities/registry";
import type { ResultRowData } from "../data/data-source";
import { FixtureDataSource } from "../data/fixture-data-source";
import { type DailySalesRow, type PeriodScope, completeDailySeries } from "../data/time-series";
import { createTestPrisma, resetDatabase } from "../../test/database";
import { ResultEngine, type ViewSettings } from "./result-engine";

const prisma = createTestPrisma();
const engine = new ResultEngine(prisma);
const hour = 60 * 60 * 1000;

// Ten customers: c01 spends 10, c02 spends 20, ... c10 spends 100 (total 550).
const customers: ResultRowData[] = Array.from({ length: 10 }, (_, i) => ({
  customer_id: `c${String(i + 1).padStart(2, "0")}`,
  customer_name: `Customer ${i + 1}`,
  total_spend: (i + 1) * 10,
  order_count: i + 1,
  avg_order_value: 10,
}));

const product = (
  id: string,
  name: string,
  category: string,
  revenue: number,
  items: number,
  brand = "Northline",
): ResultRowData => ({
  product_id: id,
  product_name: name,
  category,
  department: category === "Active" ? "Women" : "Men",
  brand,
  revenue,
  item_count: items,
});

const products: ResultRowData[] = [
  product("p1", "Slim Jeans", "Jeans", 100, 4),
  product("p2", "Wide Jeans", "Jeans", 50, 2, "Unknown brand"),
  product("p3", "Wool Sweater", "Sweaters", 200, 5),
  product("p4", "Run Tee", "Active", 25, 1),
];

async function storeResult(capability: string, rows: ResultRowData[]): Promise<string> {
  const user = await prisma.user.create({
    data: { email: `u${Math.random()}@example.test`, passwordHash: "x" },
  });
  const now = new Date();
  const auth = await prisma.authSession.create({
    data: {
      userId: user.id,
      tokenHash: `h${Math.random()}`,
      createdAt: now,
      lastActivityAt: now,
      expiresAt: new Date(now.getTime() + 12 * hour),
    },
  });
  const session = await prisma.analysisSession.create({
    data: { authSessionId: auth.id, userId: user.id },
  });
  const resultSet = await prisma.resultSet.create({
    data: {
      analysisSessionId: session.id,
      capability,
      scope: { start_date: "2025-01-01", end_date: "2026-01-01" },
      rowCount: rows.length,
      rows: { create: rows.map((data, rowIndex) => ({ rowIndex, data })) },
    },
  });
  return resultSet.id;
}

const settings = (overrides: Partial<ViewSettings> = {}): ViewSettings => ({
  filters: [],
  sort: { field: "total_spend", direction: "desc" },
  limit: 10,
  view: "bar",
  ...overrides,
});

describe("result engine (AC-8, AC-9, TD-5)", () => {
  let customerSet: string;
  let productSet: string;

  beforeEach(async () => {
    await resetDatabase(prisma);
    customerSet = await storeResult("customer_spending", customers);
    productSet = await storeResult("product_sales_performance", products);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("filtered set and displayed rows (AC-8)", () => {
    it("sorts and limits the complete result, reporting complete and filtered counts", async () => {
      const view = await engine.view(customerSet, "customer_spending", settings({ limit: 3 }));
      expect(view.rows.map((r) => r.customer_id)).toEqual(["c10", "c09", "c08"]);
      expect(view).toMatchObject({ rowCount: 10, filteredCount: 10 });
    });

    it("applies numeric filters before sorting and limiting", async () => {
      const view = await engine.view(
        customerSet,
        "customer_spending",
        settings({
          filters: [{ field: "total_spend", op: "gt", value: 50 }],
          sort: { field: "total_spend", direction: "asc" },
          limit: 2,
        }),
      );
      expect(view.rows.map((r) => r.customer_id)).toEqual(["c06", "c07"]);
      expect(view).toMatchObject({ rowCount: 10, filteredCount: 5 });
    });

    it.each([
      [{ field: "total_spend", op: "gte", value: 50 }, 6],
      [{ field: "total_spend", op: "lt", value: 50 }, 4],
      [{ field: "total_spend", op: "lte", value: 50 }, 5],
      [{ field: "order_count", op: "between", min: 3, max: 5 }, 3],
    ] as const)("filters with %j", async (filter, expected) => {
      const view = await engine.view(
        customerSet,
        "customer_spending",
        settings({ filters: [filter] }),
      );
      expect(view.filteredCount).toBe(expected);
    });

    it("filters categories by allowed values", async () => {
      const view = await engine.view(
        productSet,
        "product_sales_performance",
        settings({
          filters: [{ field: "category", op: "in", values: ["Jeans"] }],
          sort: { field: "revenue", direction: "desc" },
        }),
      );
      expect(view.rows.map((r) => r.product_id)).toEqual(["p1", "p2"]);
    });

    it("restores the full result when filters are removed, without touching the stored rows", async () => {
      await engine.view(
        customerSet,
        "customer_spending",
        settings({ filters: [{ field: "total_spend", op: "gt", value: 90 }] }),
      );
      const view = await engine.view(customerSet, "customer_spending", settings());
      expect(view.filteredCount).toBe(10);
      expect(await prisma.resultRow.count({ where: { resultSetId: customerSet } })).toBe(10);
    });

    it("breaks ties by id so the order is deterministic", async () => {
      const tied = await storeResult("customer_spending", [
        { ...customers[0], customer_id: "c02", total_spend: 50 },
        { ...customers[0], customer_id: "c01", total_spend: 50 },
      ] as ResultRowData[]);
      const view = await engine.view(tied, "customer_spending", settings());
      expect(view.rows.map((r) => r.customer_id)).toEqual(["c01", "c02"]);
    });

    it("lists the distinct category values present in the result, brands included (backend validation)", async () => {
      expect(await engine.allowedValues(productSet, "product_sales_performance")).toEqual({
        category: ["Active", "Jeans", "Sweaters"],
        department: ["Men", "Women"],
        brand: ["Northline", "Unknown brand"],
      });
      expect(await engine.allowedValues(customerSet, "customer_spending")).toEqual({});
    });
  });

  describe("analyses and targets (AC-9)", () => {
    const top3 = settings({ limit: 3 });
    const over50 = settings({ filters: [{ field: "total_spend", op: "gt", value: 50 }] });

    it("summarizes the complete set by default, with the median of an even count", async () => {
      expect(
        await engine.analyze(customerSet, "customer_spending", top3, {
          operation: "summary",
          field: "total_spend",
          target: "complete",
        }),
      ).toEqual({
        operation: "summary",
        target: "complete",
        baseCount: 10,
        field: "total_spend",
        count: 10,
        total: 550,
        average: 55,
        median: 55,
        min: 10,
        max: 100,
      });
    });

    it("summarizes only the filtered set when asked", async () => {
      expect(
        await engine.analyze(customerSet, "customer_spending", over50, {
          operation: "summary",
          field: "total_spend",
          target: "filtered",
        }),
      ).toMatchObject({ baseCount: 5, count: 5, total: 400, median: 80, min: 60, max: 100 });
    });

    it("summarizes only the displayed rows when asked", async () => {
      expect(
        await engine.analyze(customerSet, "customer_spending", top3, {
          operation: "summary",
          field: "total_spend",
          target: "displayed",
        }),
      ).toMatchObject({ baseCount: 3, total: 270, median: 90 });
    });

    it("computes the top 10% share over ALL customers while only the top 3 are displayed", async () => {
      expect(
        await engine.analyze(customerSet, "customer_spending", top3, {
          operation: "concentration",
          measure: "total_spend",
          top_percent: 10,
          target: "complete",
        }),
      ).toEqual({
        operation: "concentration",
        target: "complete",
        baseCount: 10,
        measure: "total_spend",
        topRows: 1,
        topTotal: 100,
        total: 550,
        share: 100 / 550,
      });
    });

    it("rounds the top X% up to whole rows (25% of 10 is the top 3)", async () => {
      expect(
        await engine.analyze(customerSet, "customer_spending", top3, {
          operation: "concentration",
          measure: "total_spend",
          top_percent: 25,
          target: "complete",
        }),
      ).toMatchObject({ topRows: 3, topTotal: 270 });
    });

    it("caps a top count at the number of rows", async () => {
      expect(
        await engine.analyze(customerSet, "customer_spending", over50, {
          operation: "concentration",
          measure: "total_spend",
          top_count: 20,
          target: "filtered",
        }),
      ).toMatchObject({ baseCount: 5, topRows: 5, topTotal: 400, share: 1 });
    });

    it("breaks ties at the top-X boundary by id", async () => {
      const tied = await storeResult("customer_spending", [
        { ...customers[0], customer_id: "c03", total_spend: 10 },
        { ...customers[0], customer_id: "c02", total_spend: 50 },
        { ...customers[0], customer_id: "c01", total_spend: 50 },
      ] as ResultRowData[]);
      expect(
        await engine.analyze(tied, "customer_spending", settings(), {
          operation: "concentration",
          measure: "total_spend",
          top_count: 1,
          target: "complete",
        }),
      ).toMatchObject({ topRows: 1, topTotal: 50, total: 110 });
    });

    it("handles an empty filtered set", async () => {
      const none = settings({ filters: [{ field: "total_spend", op: "gt", value: 1000 }] });
      expect(
        await engine.analyze(customerSet, "customer_spending", none, {
          operation: "summary",
          field: "total_spend",
          target: "filtered",
        }),
      ).toMatchObject({
        baseCount: 0,
        count: 0,
        total: 0,
        average: null,
        median: null,
        min: null,
        max: null,
      });
      expect(
        await engine.analyze(customerSet, "customer_spending", none, {
          operation: "concentration",
          measure: "total_spend",
          top_percent: 10,
          target: "filtered",
        }),
      ).toMatchObject({ baseCount: 0, topRows: 0, topTotal: 0, total: 0, share: null });
    });
  });

  describe("grouped view (TASK-005 AC-8)", () => {
    const byRevenue = { field: "revenue", direction: "desc" } as const;
    const grouped = (overrides: Partial<ViewSettings>) =>
      settings({ sort: byRevenue, ...overrides });

    it("groups products by category with product count, revenue, and items, largest first", async () => {
      expect(
        await engine.groups(
          productSet,
          "product_sales_performance",
          grouped({ group_by: "category" }),
        ),
      ).toEqual({
        groupBy: "category",
        groupCount: 3,
        rowCount: 4,
        filteredCount: 4,
        groups: [
          { key: "Sweaters", product_count: 1, revenue: 200, item_count: 5 },
          { key: "Jeans", product_count: 2, revenue: 150, item_count: 6 },
          { key: "Active", product_count: 1, revenue: 25, item_count: 1 },
        ],
        other: null,
      });
    });

    it("groups by department", async () => {
      const view = await engine.groups(
        productSet,
        "product_sales_performance",
        grouped({ group_by: "department" }),
      );
      expect(view.groups).toEqual([
        { key: "Men", product_count: 3, revenue: 350, item_count: 11 },
        { key: "Women", product_count: 1, revenue: 25, item_count: 1 },
      ]);
    });

    it("applies row filters before grouping", async () => {
      const view = await engine.groups(
        productSet,
        "product_sales_performance",
        grouped({
          group_by: "department",
          filters: [{ field: "category", op: "in", values: ["Jeans", "Active"] }],
        }),
      );
      expect(view).toMatchObject({ rowCount: 4, filteredCount: 3, groupCount: 2 });
      expect(view.groups.map((g) => [g.key, g.revenue])).toEqual([
        ["Men", 150],
        ["Women", 25],
      ]);
    });

    it("sorts groups by the view's measure and direction, ties by name", async () => {
      const view = await engine.groups(
        productSet,
        "product_sales_performance",
        settings({ group_by: "category", sort: { field: "item_count", direction: "asc" } }),
      );
      expect(view.groups.map((g) => g.key)).toEqual(["Active", "Sweaters", "Jeans"]);
    });

    describe("pie slices (TASK-005 AC-9, S3)", () => {
      /** n categories; category Cnn earns nn × $10.01 from one product. */
      const categories = (n: number) =>
        storeResult(
          "product_sales_performance",
          Array.from({ length: n }, (_, i) =>
            product(
              `c${i + 1}`,
              `Item ${i + 1}`,
              `C${String(i + 1).padStart(2, "0")}`,
              ((i + 1) * 1001) / 100,
              1,
            ),
          ),
        );
      const pie = async (n: number, direction: "asc" | "desc" = "desc") =>
        (
          await engine.groups(
            await categories(n),
            "product_sales_performance",
            settings({
              group_by: "category",
              view: "pie",
              sort: { field: "revenue", direction },
            }),
          )
        ).pie;

      it.each([2, 6])("draws every group when there are %i", async (n) => {
        const slices = await pie(n);
        expect(slices?.slices).toHaveLength(n);
        expect(slices?.other).toBeNull();
        const shares = slices?.slices.reduce((s, g) => s + g.share, 0) ?? 0;
        expect(shares).toBeCloseTo(1, 10);
      });

      it.each([
        [7, 2],
        [26, 21],
      ])(
        "draws the 5 largest plus Other when there are %i groups (Other holds %i)",
        async (n, rest) => {
          const slices = await pie(n);
          expect(slices?.slices.map((g) => g.key)).toEqual(
            Array.from({ length: 5 }, (_, i) => `C${String(n - i).padStart(2, "0")}`),
          );
          const restCents = Array.from({ length: rest }, (_, i) => (i + 1) * 1001).reduce(
            (a, b) => a + b,
          );
          const totalCents = Array.from({ length: n }, (_, i) => (i + 1) * 1001).reduce(
            (a, b) => a + b,
          );
          expect(slices?.other).toMatchObject({
            key: "Other",
            groups: rest,
            product_count: rest,
            revenue: restCents / 100,
            share: restCents / totalCents,
          });
          expect(slices?.measure).toBe("revenue");
        },
      );

      it("uses the largest groups even when the view sorts lowest first", async () => {
        const slices = await pie(7, "asc");
        expect(slices?.slices[0]?.key).toBe("C07");
      });

      it("has no slices unless the view is a pie", async () => {
        const view = await engine.groups(
          await categories(3),
          "product_sales_performance",
          settings({ group_by: "category", sort: { field: "revenue", direction: "desc" } }),
        );
        expect(view.pie).toBeUndefined();
      });
    });

    describe("brands: top N plus an exact Other row", () => {
      // 25 brands; brand Bnn earns nn × $10.01 (cents make the totals' exactness visible).
      let brandSet: string;
      beforeEach(async () => {
        brandSet = await storeResult(
          "product_sales_performance",
          Array.from({ length: 25 }, (_, i) =>
            product(
              `b${i + 1}`,
              `Item ${i + 1}`,
              "Jeans",
              ((i + 1) * 1001) / 100,
              i + 1,
              `B${String(i + 1).padStart(2, "0")}`,
            ),
          ),
        );
      });
      const totalCents = Array.from({ length: 25 }, (_, i) => (i + 1) * 1001).reduce(
        (a, b) => a + b,
      );

      it("shows the top 20 brands by default and combines the rest into Other", async () => {
        const view = await engine.groups(
          brandSet,
          "product_sales_performance",
          grouped({ group_by: "brand" }),
        );
        expect(view.groupCount).toBe(25);
        expect(view.groups).toHaveLength(20);
        expect(view.groups[0]).toEqual({
          key: "B25",
          product_count: 1,
          revenue: 250.25,
          item_count: 25,
        });
        expect(view.groups.at(-1)?.key).toBe("B06");
        expect(view.other).toEqual({
          key: "Other",
          groups: 5,
          product_count: 5,
          revenue: 150.15, // B01–B05: (1+2+3+4+5) × $10.01
          item_count: 15,
        });
        const cents = (g: Record<string, unknown> | null) =>
          Math.round(Number(g?.revenue ?? 0) * 100);
        const shownCents = view.groups.reduce((s, g) => s + cents(g), 0);
        expect(shownCents + cents(view.other)).toBe(totalCents);
      });

      it("shows the user's number of brands", async () => {
        const view = await engine.groups(
          brandSet,
          "product_sales_performance",
          grouped({ group_by: "brand", groupLimit: 3 }),
        );
        expect(view.groups.map((g) => g.key)).toEqual(["B25", "B24", "B23"]);
        expect(view.other).toMatchObject({ groups: 22, product_count: 22 });
      });

      it("takes the first brands in the view's order when sorted lowest first", async () => {
        const view = await engine.groups(
          brandSet,
          "product_sales_performance",
          settings({
            group_by: "brand",
            groupLimit: 2,
            sort: { field: "revenue", direction: "asc" },
          }),
        );
        expect(view.groups.map((g) => g.key)).toEqual(["B01", "B02"]);
        expect(view.other?.groups).toBe(23);
      });

      it("has no Other row when every brand is shown", async () => {
        const view = await engine.groups(
          brandSet,
          "product_sales_performance",
          grouped({ group_by: "brand", groupLimit: 30 }),
        );
        expect(view.groups).toHaveLength(25);
        expect(view.other).toBeNull();
      });
    });
  });

  describe("time-series roll-up and totals (TASK-005 AC-5)", () => {
    const LATER = "2030-01-01"; // "today" after every period: no cut-off
    const main = (start_date: string, end_date: string): PeriodScope => ({
      period: "main",
      scope: { start_date, end_date },
    });
    const comparison = (start_date: string, end_date: string): PeriodScope => ({
      period: "comparison",
      scope: { start_date, end_date },
    });
    const sale = (
      date: string,
      revenue: number,
      orders = 1,
      items = 1,
      period: DailySalesRow["period"] = "main",
    ): DailySalesRow => ({ period, date, revenue, order_count: orders, item_count: items });

    /** Stores the complete daily series, as the orchestrator will (zero days, cut-off). */
    async function storeSeries(sales: DailySalesRow[], periods: PeriodScope[], today = LATER) {
      return storeResult("sales_time_series", completeDailySeries(sales, periods, today));
    }
    const series = (id: string, periods: PeriodScope[], interval: Interval, today = LATER) =>
      engine.series(id, { periods, interval, measure: "revenue", today });

    it("rolls days up to months, with zero months, labels, and real first and last days", async () => {
      const periods = [main("2025-01-01", "2025-04-01")];
      const id = await storeSeries(
        [sale("2025-01-01", 10.1), sale("2025-01-31", 5.05, 1, 2), sale("2025-02-15", 20, 2, 3)],
        periods,
      );
      const view = await series(id, periods, "month");
      expect(view.main).toEqual([
        {
          label: "Jan 2025",
          firstDay: "2025-01-01",
          lastDay: "2025-01-31",
          partial: false,
          revenue: 15.15,
          order_count: 2,
          item_count: 3,
        },
        {
          label: "Feb 2025",
          firstDay: "2025-02-01",
          lastDay: "2025-02-28",
          partial: false,
          revenue: 20,
          order_count: 2,
          item_count: 3,
        },
        {
          label: "Mar 2025",
          firstDay: "2025-03-01",
          lastDay: "2025-03-31",
          partial: false,
          revenue: 0,
          order_count: 0,
          item_count: 0,
        },
      ]);
      expect(view).toMatchObject({ interval: "month", measure: "revenue", lengthsDiffer: false });
      expect(view.comparison).toBeUndefined();
      expect(view.totals).toEqual({ main: { revenue: 35.15, order_count: 4, item_count: 6 } });
    });

    it("labels days, and the day, week, and month sums all equal the daily sums", async () => {
      const scope2025 = { start_date: "2025-01-01", end_date: "2026-01-01" };
      const periods = [{ period: "main" as const, scope: scope2025 }];
      const daily = await new FixtureDataSource().fetchTimeSeries(scope2025, {}, LATER);
      const id = await storeResult("sales_time_series", daily);
      const cents = (values: number[]) => values.reduce((s, v) => s + Math.round(v * 100), 0);
      const expected = {
        revenue: cents(daily.map((d) => d.revenue)),
        orders: daily.reduce((s, d) => s + d.order_count, 0),
        items: daily.reduce((s, d) => s + d.item_count, 0),
      };
      expect(expected.items).toBeGreaterThan(0);
      for (const interval of ["day", "week", "month"] as const) {
        const view = await series(id, periods, interval);
        expect(view.main).toHaveLength({ day: 365, week: 53, month: 12 }[interval]);
        expect(cents(view.main.map((b) => b.revenue))).toBe(expected.revenue);
        expect(view.main.reduce((s, b) => s + b.order_count, 0)).toBe(expected.orders);
        expect(view.main.reduce((s, b) => s + b.item_count, 0)).toBe(expected.items);
        expect(Math.round((view.totals.main.revenue as number) * 100)).toBe(expected.revenue);
      }
      const days = await series(id, periods, "day");
      expect(days.main[5]).toMatchObject({
        label: "6 Jan 2025",
        firstDay: "2025-01-06",
        lastDay: "2025-01-06",
        partial: false,
      });
    });

    it("uses ISO weeks across a year boundary", async () => {
      const periods = [main("2024-12-30", "2025-01-13")]; // Monday to Monday
      const id = await storeSeries(
        [sale("2024-12-31", 5), sale("2025-01-02", 7), sale("2025-01-06", 1)],
        periods,
      );
      const view = await series(id, periods, "week");
      expect(view.main.map((b) => [b.label, b.firstDay, b.lastDay, b.partial, b.revenue])).toEqual([
        ["Week of 30 Dec 2024", "2024-12-30", "2025-01-05", false, 12],
        ["Week of 6 Jan 2025", "2025-01-06", "2025-01-12", false, 1],
      ]);
    });

    it("marks a first and last week that are not fully inside the period as partial", async () => {
      const periods = [main("2025-01-01", "2025-01-16")]; // Wednesday to Wednesday (inclusive)
      const id = await storeSeries([], periods);
      const view = await series(id, periods, "week");
      expect(view.main.map((b) => [b.label, b.firstDay, b.lastDay, b.partial])).toEqual([
        ["Week of 30 Dec 2024", "2025-01-01", "2025-01-05", true],
        ["Week of 6 Jan 2025", "2025-01-06", "2025-01-12", false],
        ["Week of 13 Jan 2025", "2025-01-13", "2025-01-15", true],
      ]);
    });

    it("marks a first and last month that are not fully inside the period as partial", async () => {
      const periods = [main("2025-01-15", "2025-03-10")];
      const id = await storeSeries([], periods);
      const view = await series(id, periods, "month");
      expect(view.main.map((b) => [b.label, b.firstDay, b.lastDay, b.partial])).toEqual([
        ["Jan 2025", "2025-01-15", "2025-01-31", true],
        ["Feb 2025", "2025-02-01", "2025-02-28", false],
        ["Mar 2025", "2025-03-01", "2025-03-09", true],
      ]);
    });

    it("marks the bucket containing today as partial; later days are not stored", async () => {
      const periods = [main("2025-01-01", "2025-04-01")];
      const today = "2025-02-10";
      const id = await storeSeries([sale("2025-02-10", 3)], periods, today);
      const months = await series(id, periods, "month", today);
      expect(months.main.map((b) => [b.label, b.lastDay, b.partial])).toEqual([
        ["Jan 2025", "2025-01-31", false],
        ["Feb 2025", "2025-02-10", true],
      ]);
      const days = await series(id, periods, "day", today);
      expect(days.main.at(-2)).toMatchObject({ firstDay: "2025-02-09", partial: false });
      expect(days.main.at(-1)).toMatchObject({ firstDay: "2025-02-10", partial: true, revenue: 3 });
    });

    it("keeps each period's buckets apart and reports unequal lengths (31 vs 28 days)", async () => {
      const periods = [main("2025-03-01", "2025-04-01"), comparison("2025-02-01", "2025-03-01")];
      const id = await storeSeries(
        [sale("2025-03-01", 4), sale("2025-02-01", 9, 1, 1, "comparison")],
        periods,
      );
      const view = await series(id, periods, "day");
      expect(view.main).toHaveLength(31);
      expect(view.comparison).toHaveLength(28);
      expect(view.lengthsDiffer).toBe(true);
      // Bucket k of the period pairs with bucket k of the comparison period.
      expect([view.main[0]?.firstDay, view.comparison?.[0]?.firstDay]).toEqual([
        "2025-03-01",
        "2025-02-01",
      ]);
      expect([view.main[0]?.revenue, view.comparison?.[0]?.revenue]).toEqual([4, 9]);
      expect(view.comparison?.[27]?.firstDay).toBe("2025-02-28");
    });

    it("gives each period's totals, the change, and the % change", async () => {
      const periods = [main("2025-01-01", "2025-02-01"), comparison("2024-01-01", "2024-02-01")];
      const id = await storeSeries(
        [
          sale("2025-01-03", 100.1, 2, 3),
          sale("2025-01-20", 50.05, 1, 1),
          sale("2024-01-10", 100.1, 4, 4, "comparison"),
        ],
        periods,
      );
      const view = await series(id, periods, "month");
      expect(view.lengthsDiffer).toBe(false);
      expect(view.totals).toEqual({
        main: { revenue: 150.15, order_count: 3, item_count: 4 },
        comparison: { revenue: 100.1, order_count: 4, item_count: 4 },
        change: {
          revenue: { amount: 50.05, percent: 0.5 },
          order_count: { amount: -1, percent: -0.25 },
          item_count: { amount: 0, percent: 0 },
        },
      });
    });

    it("gives no % change against a zero comparison total", async () => {
      const periods = [main("2025-01-01", "2025-01-08"), comparison("2024-12-25", "2025-01-01")];
      const id = await storeSeries([sale("2025-01-02", 12.5, 1, 2)], periods);
      const view = await series(id, periods, "day");
      expect(view.totals.comparison).toEqual({ revenue: 0, order_count: 0, item_count: 0 });
      expect(view.totals.change).toEqual({
        revenue: { amount: 12.5, percent: null },
        order_count: { amount: 1, percent: null },
        item_count: { amount: 2, percent: null },
      });
    });
  });
});
