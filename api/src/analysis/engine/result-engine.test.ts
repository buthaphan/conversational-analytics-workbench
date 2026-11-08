import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { ResultRowData } from "../data/data-source";
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

const products: ResultRowData[] = [
  { product_id: "p1", product_name: "Slim Jeans", category: "Jeans", revenue: 100, item_count: 4 },
  { product_id: "p2", product_name: "Wide Jeans", category: "Jeans", revenue: 50, item_count: 2 },
  {
    product_id: "p3",
    product_name: "Wool Sweater",
    category: "Sweaters",
    revenue: 200,
    item_count: 5,
  },
  { product_id: "p4", product_name: "Run Tee", category: "Active", revenue: 25, item_count: 1 },
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

    it("lists the distinct category values present in the result", async () => {
      expect(await engine.allowedValues(productSet, "product_sales_performance")).toEqual({
        category: ["Active", "Jeans", "Sweaters"],
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

    it("groups products by category with counts and totals, largest revenue first", async () => {
      expect(
        await engine.analyze(
          productSet,
          "product_sales_performance",
          settings({ sort: { field: "revenue", direction: "desc" } }),
          {
            operation: "group",
            group_by: "category",
            target: "complete",
          },
        ),
      ).toEqual({
        operation: "group",
        target: "complete",
        baseCount: 4,
        groupBy: "category",
        groups: [
          { key: "Sweaters", rows: 1, revenue: 200, item_count: 5 },
          { key: "Jeans", rows: 2, revenue: 150, item_count: 6 },
          { key: "Active", rows: 1, revenue: 25, item_count: 1 },
        ],
      });
    });
  });
});
