import { describe, expect, it } from "vitest";
import { type Fixture, FixtureDataSource, generateFixture } from "./fixture-data-source";

const scope2025 = { start_date: "2025-01-01", end_date: "2026-01-01" };

// Hand-computed expectations: only "Complete" items inside [start, end) count.
const tiny: Fixture = {
  customers: [
    { id: "C1", name: "Ann Lee" },
    { id: "C2", name: "Bo Diaz" },
  ],
  products: [
    { id: "P1", name: "Slim Jeans", category: "Jeans" },
    { id: "P2", name: "Wool Sweater", category: "Sweaters" },
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
        revenue: 15.15,
        item_count: 2,
      },
      {
        product_id: "P2",
        product_name: "Wool Sweater",
        category: "Sweaters",
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

    it("yields a full-year customer result large enough to exercise limits and analyses", async () => {
      const rows = await new FixtureDataSource().fetch("customer_spending", scope2025);
      expect(rows.length).toBeGreaterThan(200);
    });
  });
});
