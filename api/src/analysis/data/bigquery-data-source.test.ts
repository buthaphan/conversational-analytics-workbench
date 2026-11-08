import { describe, expect, it } from "vitest";
import { CAPABILITIES } from "../capabilities/registry";
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

  it("maps product rows to the registry fields", async () => {
    const runner = new FakeRunner(
      rows([
        {
          product_id: 5,
          product_name: "Slim Jeans",
          category: "Jeans",
          revenue_cents: 25_050,
          item_count: 4,
        },
      ]),
    );
    expect(await new BigQueryDataSource(runner).fetch("product_sales_performance", scope)).toEqual([
      {
        product_id: "5",
        product_name: "Slim Jeans",
        category: "Jeans",
        revenue: 250.5,
        item_count: 4,
      },
    ]);
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
