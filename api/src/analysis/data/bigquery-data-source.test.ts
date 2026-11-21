import { describe, expect, it } from "vitest";
import { CAPABILITIES, TIME_SERIES_ROW_CAP } from "../capabilities/registry";
import type { DailySalesRequest } from "./time-series";
import {
  BigQueryDataSource,
  BigQueryRetrievalError,
  MAX_BYTES_BILLED,
  QUERY_TIMEOUT_MS,
  type QueryRequest,
  type QueryResult,
  type QueryRunner,
  sdkParams,
} from "./bigquery-data-source";
import { BigQueryDate } from "@google-cloud/bigquery";

describe("SDK parameter conversion (TASK-004 AC-6)", () => {
  // A plain string declared as DATE reaches BigQuery as NULL (found by the live known-answer run).
  it("passes DATE parameters as BigQuery dates and leaves the others unchanged", () => {
    const params = sdkParams(
      { start_date: "2025-01-01", end_date: "2026-01-01", row_limit: 50_001 },
      { start_date: "DATE", end_date: "DATE", row_limit: "INT64" },
    );
    expect(params.start_date).toBeInstanceOf(BigQueryDate);
    expect((params.start_date as BigQueryDate).value).toBe("2025-01-01");
    expect((params.end_date as BigQueryDate).value).toBe("2026-01-01");
    expect(params.row_limit).toBe(50_001);
  });

  it("leaves untyped parameters unchanged", () => {
    expect(sdkParams({ s: "x" }, undefined)).toEqual({ s: "x" });
  });
});

/** Records each request and answers with canned rows. */
class FakeRunner implements QueryRunner {
  requests: QueryRequest[] = [];
  constructor(private readonly answer: () => Promise<QueryResult>) {}
  run(request: QueryRequest): Promise<QueryResult> {
    this.requests.push(request);
    return this.answer();
  }
}
const rows = (list: Record<string, unknown>[]) => async () => ({
  rows: list,
  totalBytesProcessed: 1,
});
const scope = { start_date: "2025-01-01", end_date: "2026-01-01" };

describe("BigQuery data source (TASK-004 AC-6)", () => {
  describe.each(["customer_spending", "product_sales_performance"] as const)(
    "%s query request",
    (capability) => {
      it("passes the scope only as typed parameters, with the cap, timeout, and over-cap guard", async () => {
        const runner = new FakeRunner(rows([]));
        await new BigQueryDataSource(runner).fetch(capability, scope);
        const [request] = runner.requests;
        expect(runner.requests).toHaveLength(1);
        expect(request?.sql).not.toContain("2025-01-01");
        expect(request?.sql).not.toContain("2026-01-01");
        expect(request?.sql).toMatch(/@start_date/);
        expect(request?.sql).toMatch(/@end_date/);
        expect(request?.sql).toMatch(/LIMIT @row_limit/);
        expect(request?.params).toEqual({
          start_date: "2025-01-01",
          end_date: "2026-01-01",
          row_limit: CAPABILITIES[capability].rowCap + 1,
        });
        expect(request?.types).toEqual({
          start_date: "DATE",
          end_date: "DATE",
          row_limit: "INT64",
        });
        expect(request?.maximumBytesBilled).toBe(MAX_BYTES_BILLED);
        expect(request?.timeoutMs).toBe(QUERY_TIMEOUT_MS);
        expect(request?.dryRun).toBeUndefined();
      });

      it("counts Complete items only, windows on the order date, and selects no personal fields", async () => {
        const runner = new FakeRunner(rows([]));
        await new BigQueryDataSource(runner).fetch(capability, scope);
        const sql = runner.requests[0]?.sql ?? "";
        expect(sql).toMatch(/oi\.status = 'Complete'/);
        expect(sql).toMatch(/o\.created_at >= TIMESTAMP\(@start_date\)/);
        expect(sql).toMatch(/o\.created_at < TIMESTAMP\(@end_date\)/);
        expect(sql).toMatch(/ROUND\(oi\.sale_price \* 100\)/);
        expect(sql).not.toMatch(
          /email|street_address|postal_code|latitude|longitude|city|state\b/i,
        );
        expect(sql).not.toMatch(/ORDER BY/i);
      });
    },
  );

  it("maps customer rows to the registry fields, in cents-exact dollars", async () => {
    const runner = new FakeRunner(
      rows([
        { customer_id: "17", customer_name: "Ada Park", spend_cents: 100_001, order_count: 3 },
        { customer_id: 42, customer_name: "Ben Ruiz", spend_cents: "1999", order_count: "1" },
      ]),
    );
    expect(await new BigQueryDataSource(runner).fetch("customer_spending", scope)).toEqual([
      {
        customer_id: "17",
        customer_name: "Ada Park",
        total_spend: 1000.01,
        order_count: 3,
        avg_order_value: 333.34, // 100,001 / 3 = 33,333.67 cents → 33,334 → $333.34
      },
      {
        customer_id: "42",
        customer_name: "Ben Ruiz",
        total_spend: 19.99,
        order_count: 1,
        avg_order_value: 19.99,
      },
    ]);
  });

  it('maps product rows to the registry fields; a missing brand becomes "Unknown brand" (TASK-005 AC-2)', async () => {
    const runner = new FakeRunner(
      rows([
        {
          product_id: 5,
          product_name: "Slim Jeans",
          category: "Jeans",
          department: "Men",
          brand: "Northline",
          revenue_cents: 25_050,
          item_count: 4,
        },
        {
          product_id: 6,
          product_name: "Wool Sweater",
          category: "Sweaters",
          department: "Women",
          brand: null,
          revenue_cents: 1_000,
          item_count: 1,
        },
      ]),
    );
    expect(await new BigQueryDataSource(runner).fetch("product_sales_performance", scope)).toEqual([
      {
        product_id: "5",
        product_name: "Slim Jeans",
        category: "Jeans",
        department: "Men",
        brand: "Northline",
        revenue: 250.5,
        item_count: 4,
      },
      {
        product_id: "6",
        product_name: "Wool Sweater",
        category: "Sweaters",
        department: "Women",
        brand: "Unknown brand",
        revenue: 10,
        item_count: 1,
      },
    ]);
  });

  it("selects and groups by department and brand (TASK-005 AC-2)", async () => {
    const runner = new FakeRunner(rows([]));
    await new BigQueryDataSource(runner).fetch("product_sales_performance", scope);
    const sql = runner.requests[0]?.sql ?? "";
    expect(sql).toMatch(/p\.department AS department/);
    expect(sql).toMatch(/p\.brand AS brand/);
    expect(sql).toMatch(/GROUP BY p\.id, p\.name, p\.category, p\.department, p\.brand/);
  });

  it("refuses a product row without a department (never null in the profile)", async () => {
    const row = {
      product_id: 5,
      product_name: "Slim Jeans",
      category: "Jeans",
      department: null,
      brand: "Northline",
      revenue_cents: 100,
      item_count: 1,
    };
    const source = new BigQueryDataSource(new FakeRunner(rows([row])));
    await expect(source.fetch("product_sales_performance", scope)).rejects.toBeInstanceOf(
      BigQueryRetrievalError,
    );
  });

  it.each([
    [
      "a missing number",
      { customer_id: "1", customer_name: "A", spend_cents: null, order_count: 1 },
    ],
    [
      "a non-numeric count",
      { customer_id: "1", customer_name: "A", spend_cents: 5, order_count: "x" },
    ],
    ["a missing ID", { customer_id: null, customer_name: "A", spend_cents: 5, order_count: 1 }],
    ["zero orders", { customer_id: "1", customer_name: "A", spend_cents: 5, order_count: 0 }],
  ])("refuses a malformed row (%s)", async (_case, row) => {
    const source = new BigQueryDataSource(new FakeRunner(rows([row])));
    await expect(source.fetch("customer_spending", scope)).rejects.toBeInstanceOf(
      BigQueryRetrievalError,
    );
  });

  it("turns any query failure into a BigQueryRetrievalError without scope details", async () => {
    const source = new BigQueryDataSource(
      new FakeRunner(async () => {
        throw new Error("Access Denied: project secret-project-123, 2025-01-01");
      }),
    );
    const error = await source.fetch("customer_spending", scope).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BigQueryRetrievalError);
    expect((error as Error).name).toBe("BigQueryRetrievalError");
    expect((error as Error).message).not.toMatch(/secret-project|2025/);
  });

  describe("daily sales (TASK-005 AC-4)", () => {
    const main = { period: "main" as const, scope };
    const comparison = {
      period: "comparison" as const,
      scope: { start_date: "2024-01-01", end_date: "2025-01-01" },
    };
    const request = async (req: DailySalesRequest) => {
      const runner = new FakeRunner(rows([]));
      await new BigQueryDataSource(runner).fetchDailySales(req);
      return runner.requests[0] as QueryRequest;
    };

    it("passes dates, comparison, and filter only as typed parameters", async () => {
      const req = await request({
        periods: [main, comparison],
        productFilter: { field: "category", values: ["Jeans", "Tops & Tees"] },
      });
      for (const value of ["2025-01-01", "2026-01-01", "2024-01-01", "Jeans", "Tops & Tees"])
        expect(req.sql).not.toContain(value);
      expect(req.params).toEqual({
        start_date: "2025-01-01",
        end_date: "2026-01-01",
        has_comparison: true,
        comparison_start: "2024-01-01",
        comparison_end: "2025-01-01",
        filter_field: "category",
        filter_values: ["Jeans", "Tops & Tees"],
        row_limit: TIME_SERIES_ROW_CAP + 1,
      });
      expect(req.types).toEqual({
        start_date: "DATE",
        end_date: "DATE",
        has_comparison: "BOOL",
        comparison_start: "DATE",
        comparison_end: "DATE",
        filter_field: "STRING",
        filter_values: ["STRING"],
        row_limit: "INT64",
      });
      expect(req.maximumBytesBilled).toBe(MAX_BYTES_BILLED);
      expect(req.timeoutMs).toBe(QUERY_TIMEOUT_MS);
    });

    it("turns the comparison off and leaves the filter empty when there is none", async () => {
      const req = await request({ periods: [main] });
      expect(req.params).toMatchObject({
        has_comparison: false,
        // Unused, but typed DATE parameters need a value.
        comparison_start: "2025-01-01",
        comparison_end: "2026-01-01",
        filter_field: "",
        filter_values: [],
      });
    });

    it("passes a department filter by its field name", async () => {
      const req = await request({
        periods: [main],
        productFilter: { field: "department", values: ["Women"] },
      });
      expect(req.params).toMatchObject({ filter_field: "department", filter_values: ["Women"] });
    });

    it("sends the same SQL text for every request", async () => {
      const a = await request({ periods: [main] });
      const b = await request({
        periods: [main, comparison],
        productFilter: { field: "department", values: ["Men"] },
      });
      expect(a.sql).toBe(b.sql);
    });

    it("counts Complete items per UTC order day with the cents rule, without sorting", async () => {
      const { sql } = await request({ periods: [main] });
      expect(sql).toMatch(/oi\.status = 'Complete'/);
      expect(sql).toMatch(/DATE\(o\.created_at\)/);
      expect(sql).toMatch(/o\.created_at >= TIMESTAMP\(per\.start_date\)/);
      expect(sql).toMatch(/o\.created_at < TIMESTAMP\(per\.end_date\)/);
      expect(sql).toMatch(/ROUND\(oi\.sale_price \* 100\)/);
      expect(sql).toMatch(/COUNT\(DISTINCT oi\.order_id\)/);
      expect(sql).toMatch(/p\.category IN UNNEST\(@filter_values\)/);
      expect(sql).toMatch(/p\.department IN UNNEST\(@filter_values\)/);
      expect(sql).toMatch(/LIMIT @row_limit/);
      expect(sql).not.toMatch(/ORDER BY/i);
      expect(sql).not.toMatch(/email|street_address|postal_code|latitude|longitude/i);
    });

    it("maps rows to daily figures in cents-exact dollars", async () => {
      const runner = new FakeRunner(
        rows([
          {
            period: "main",
            sales_date: "2025-03-01",
            revenue_cents: 100_001,
            order_count: 3,
            item_count: 5,
          },
          {
            period: "comparison",
            sales_date: "2024-03-01",
            revenue_cents: "1999",
            order_count: "1",
            item_count: "1",
          },
        ]),
      );
      expect(
        await new BigQueryDataSource(runner).fetchDailySales({ periods: [main, comparison] }),
      ).toEqual([
        { period: "main", date: "2025-03-01", revenue: 1000.01, order_count: 3, item_count: 5 },
        { period: "comparison", date: "2024-03-01", revenue: 19.99, order_count: 1, item_count: 1 },
      ]);
    });

    const good = {
      period: "main",
      sales_date: "2025-03-01",
      revenue_cents: 100,
      order_count: 1,
      item_count: 1,
    };
    it.each([
      ["an unknown period", { ...good, period: "other" }],
      ["a malformed date", { ...good, sales_date: "2025-3-1" }],
      ["a missing date", { ...good, sales_date: null }],
      ["zero orders", { ...good, order_count: 0 }],
      ["zero items", { ...good, item_count: 0 }],
      ["a missing revenue", { ...good, revenue_cents: null }],
    ])("refuses a malformed row (%s)", async (_case, row) => {
      const source = new BigQueryDataSource(new FakeRunner(rows([row])));
      await expect(source.fetchDailySales({ periods: [main] })).rejects.toBeInstanceOf(
        BigQueryRetrievalError,
      );
    });

    it("turns a query failure into a BigQueryRetrievalError without details", async () => {
      const source = new BigQueryDataSource(
        new FakeRunner(async () => {
          throw new Error("Access Denied: project secret-project-123, Jeans");
        }),
      );
      const error = await source.fetchDailySales({ periods: [main] }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BigQueryRetrievalError);
      expect((error as Error).message).not.toMatch(/secret-project|Jeans/);
    });
  });

  it("returns rows beyond the cap unchanged, so the orchestrator refuses them (AC-11)", async () => {
    const cap = CAPABILITIES.customer_spending.rowCap;
    const many = Array.from({ length: 3 }, (_, i) => ({
      customer_id: String(i),
      customer_name: "x",
      spend_cents: 100,
      order_count: 1,
    }));
    const source = new BigQueryDataSource(new FakeRunner(rows(many)));
    expect(await source.fetch("customer_spending", scope)).toHaveLength(3);
    expect(cap).toBeGreaterThan(3);
  });
});
