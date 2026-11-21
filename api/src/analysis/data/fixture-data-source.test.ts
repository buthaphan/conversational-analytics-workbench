import { describe, expect, it } from "vitest";
import type { ResultRowData } from "./data-source";
import { type Fixture, FixtureDataSource, generateFixture } from "./fixture-data-source";

const scope2025 = { start_date: "2025-01-01", end_date: "2026-01-01" };

// Hand-computed expectations: only "Complete" items inside [start, end) count.
const tiny: Fixture = {
  customers: [
    { id: "C1", name: "Ann Lee" },
    { id: "C2", name: "Bo Diaz" },
  ],
  products: [
    { id: "P1", name: "Slim Jeans", category: "Jeans", department: "Men", brand: "Northline" },
    // TheLook has products without a brand (TASK-005 AC-1).
    { id: "P2", name: "Wool Sweater", category: "Sweaters", department: "Women", brand: null },
  ],
  items: [
    {
      orderId: "o1",
      customerId: "C1",
      productId: "P1",
      date: "2025-01-01",
      status: "Complete",
      salePrice: 10.1,
    },
    {
      orderId: "o1",
      customerId: "C1",
      productId: "P2",
      date: "2025-01-01",
      status: "Complete",
      salePrice: 20.2,
    },
    {
      orderId: "o2",
      customerId: "C1",
      productId: "P1",
      date: "2025-06-30",
      status: "Returned",
      salePrice: 50,
    },
    {
      orderId: "o3",
      customerId: "C1",
      productId: "P1",
      date: "2025-12-31",
      status: "Complete",
      salePrice: 5.05,
    },
    {
      orderId: "o4",
      customerId: "C2",
      productId: "P2",
      date: "2026-01-01",
      status: "Complete",
      salePrice: 99,
    },
    {
      orderId: "o5",
      customerId: "C2",
      productId: "P2",
      date: "2024-12-31",
      status: "Complete",
      salePrice: 7,
    },
    {
      orderId: "o6",
      customerId: "C2",
      productId: "P1",
      date: "2025-03-01",
      status: "Cancelled",
      salePrice: 3,
    },
  ],
};

describe("fixture data source (AC-14, TD-12)", () => {
  const source = new FixtureDataSource(tiny);

  it("computes customer spending from completed items in scope", async () => {
    expect(await source.fetch("customer_spending", scope2025)).toEqual([
      {
        customer_id: "C1",
        customer_name: "Ann Lee",
        total_spend: 35.35,
        order_count: 2,
        avg_order_value: 17.68,
      },
    ]);
  });

  it("computes product sales performance from completed items in scope", async () => {
    expect(await source.fetch("product_sales_performance", scope2025)).toEqual([
      {
        product_id: "P1",
        product_name: "Slim Jeans",
        category: "Jeans",
        department: "Men",
        brand: "Northline",
        revenue: 15.15,
        item_count: 2,
      },
      {
        product_id: "P2",
        product_name: "Wool Sweater",
        category: "Sweaters",
        department: "Women",
        brand: "Unknown brand",
        revenue: 20.2,
        item_count: 1,
      },
    ]);
  });

  it("includes the start date and excludes the end date", async () => {
    const rows = await source.fetch("customer_spending", {
      start_date: "2025-12-31",
      end_date: "2026-01-02",
    });
    expect(rows).toEqual([
      {
        customer_id: "C1",
        customer_name: "Ann Lee",
        total_spend: 5.05,
        order_count: 1,
        avg_order_value: 5.05,
      },
      {
        customer_id: "C2",
        customer_name: "Bo Diaz",
        total_spend: 99,
        order_count: 1,
        avg_order_value: 99,
      },
    ]);
  });

  it("returns no rows for a scope without completed purchases", async () => {
    expect(
      await source.fetch("product_sales_performance", {
        start_date: "2023-01-01",
        end_date: "2024-01-01",
      }),
    ).toEqual([]);
  });

  describe("daily sales (TASK-005 AC-4)", () => {
    const main = { period: "main" as const, scope: scope2025 };

    it("sums completed items per day: revenue in cents, distinct orders, items", async () => {
      expect(await source.fetchDailySales({ periods: [main] })).toEqual([
        { period: "main", date: "2025-01-01", revenue: 30.3, order_count: 1, item_count: 2 },
        { period: "main", date: "2025-12-31", revenue: 5.05, order_count: 1, item_count: 1 },
      ]);
    });

    it("applies a category filter", async () => {
      const productFilter = { field: "category" as const, values: ["Jeans"] };
      expect(await source.fetchDailySales({ periods: [main], productFilter })).toEqual([
        { period: "main", date: "2025-01-01", revenue: 10.1, order_count: 1, item_count: 1 },
        { period: "main", date: "2025-12-31", revenue: 5.05, order_count: 1, item_count: 1 },
      ]);
    });

    it("applies a department filter with several values", async () => {
      const women = { field: "department" as const, values: ["Women"] };
      expect(await source.fetchDailySales({ periods: [main], productFilter: women })).toEqual([
        { period: "main", date: "2025-01-01", revenue: 20.2, order_count: 1, item_count: 1 },
      ]);
      const both = { field: "department" as const, values: ["Men", "Women"] };
      expect(await source.fetchDailySales({ periods: [main], productFilter: both })).toEqual(
        await source.fetchDailySales({ periods: [main] }),
      );
    });

    it("returns each period's days, tagged with the period", async () => {
      const comparison = {
        period: "comparison" as const,
        scope: { start_date: "2024-01-01", end_date: "2025-01-01" },
      };
      const rows = await source.fetchDailySales({ periods: [main, comparison] });
      expect(rows.filter((r) => r.period === "comparison")).toEqual([
        { period: "comparison", date: "2024-12-31", revenue: 7, order_count: 1, item_count: 1 },
      ]);
      expect(rows.filter((r) => r.period === "main")).toHaveLength(2);
    });

    it("counts a day in both periods when they overlap", async () => {
      const overlap = { period: "comparison" as const, scope: scope2025 };
      const rows = await source.fetchDailySales({ periods: [main, overlap] });
      expect(rows).toHaveLength(4);
    });

    it("is completed by the shared rules: zero days and the today cut-off", async () => {
      const rows = await source.fetchTimeSeries(
        { start_date: "2025-12-30", end_date: "2026-01-02" },
        {},
        "2025-12-31",
      );
      expect(rows).toEqual([
        { period: "main", date: "2025-12-30", revenue: 0, order_count: 0, item_count: 0 },
        { period: "main", date: "2025-12-31", revenue: 5.05, order_count: 1, item_count: 1 },
      ]);
    });

    it("agrees with the product result on the generated fixture: same revenue and items", async () => {
      const generated = new FixtureDataSource();
      const daily = await generated.fetchDailySales({ periods: [main] });
      const products = await generated.fetch("product_sales_performance", scope2025);
      const cents = (rows: ResultRowData[], field: string) =>
        rows.reduce((sum, r) => sum + Math.round((r[field] as number) * 100), 0);
      const count = (rows: ResultRowData[]) =>
        rows.reduce((sum, r) => sum + (r.item_count as number), 0);
      expect(daily.length).toBeGreaterThan(100);
      expect(cents(daily, "revenue")).toBe(cents(products, "revenue"));
      expect(count(daily)).toBe(count(products));
    });
  });

  describe("generated fixture", () => {
    it("is deterministic", () => {
      expect(generateFixture()).toEqual(generateFixture());
    });

    it("has realistic sizes and dates from 2024-01-01 up to 2026-11-08", () => {
      const fixture = generateFixture();
      expect(fixture.customers).toHaveLength(400);
      expect(fixture.products).toHaveLength(120);
      expect(new Set(fixture.products.map((p) => p.category)).size).toBe(8);
      expect(fixture.items.length).toBeGreaterThan(2000);
      expect(fixture.items.every((i) => i.date >= "2024-01-01" && i.date < "2026-11-08")).toBe(
        true,
      );
      expect(new Set(fixture.items.map((i) => i.status))).toEqual(
        new Set(["Complete", "Returned", "Cancelled", "Processing"]),
      );
    });

    it("gives products both departments, more brands with sales than the brand cap, and a few without a brand (TASK-005 AC-2)", async () => {
      const fixture = generateFixture();
      expect(new Set(fixture.products.map((p) => p.department))).toEqual(new Set(["Men", "Women"]));
      expect(fixture.products.some((p) => p.brand === null)).toBe(true);
      const rows = await new FixtureDataSource().fetch("product_sales_performance", scope2025);
      expect(new Set(rows.map((r) => r.brand)).size).toBeGreaterThan(20);
      expect(rows.some((r) => r.brand === "Unknown brand")).toBe(true);
    });

    it("yields a full-year customer result large enough to exercise limits and analyses", async () => {
      const rows = await new FixtureDataSource().fetch("customer_spending", scope2025);
      expect(rows.length).toBeGreaterThan(200);
    });
  });
});
