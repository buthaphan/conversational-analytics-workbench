import { describe, expect, it } from "vitest";
import {
  type EntityCapabilityId,
  type Scope,
  TIME_SERIES_ROW_CAP,
} from "../analysis/capabilities/registry";
import {
  BigQueryDataSource,
  MAX_BYTES_BILLED,
  QUERY_TIMEOUT_MS,
  THELOOK_DATASET as D,
  createBigQueryRunner,
} from "../analysis/data/bigquery-data-source";
import type { ResultRowData } from "../analysis/data/data-source";
import {
  type Fixture,
  FixtureDataSource,
  type ItemStatus,
} from "../analysis/data/fixture-data-source";
import {
  type DailySalesRequest,
  type DailySalesRow,
  seriesPeriods,
} from "../analysis/data/time-series";

/**
 * Known-answer check (TASK-004 AC-7, TASK-005 AC-13). For small scopes, fetch every item (all
 * statuses) of the orders placed in the scope, run the reference aggregation (FixtureDataSource)
 * over that extract, and require the BigQuery adapter to return exactly the same rows: customers,
 * products (with department and brand), and daily sales (unfiltered, for one category, and with a
 * comparison period). Also measures bytes processed, latency, and row counts for realistic scopes
 * (AC-5, AC-8). Run: npm run live:test -w api
 */
const projectId = process.env.GOOGLE_CLOUD_PROJECT?.trim();

const SCOPES: { label: string; scope: Scope }[] = [
  // Recent week: has Processing and Shipped items as well as Complete, Returned, Cancelled.
  { label: "recent week", scope: { start_date: "2026-10-01", end_date: "2026-10-08" } },
  // Crosses a month boundary.
  { label: "month boundary", scope: { start_date: "2025-06-28", end_date: "2025-07-04" } },
];

const EXTRACT_SQL = `
  SELECT
    CAST(oi.order_id AS STRING) AS order_id,
    CAST(oi.user_id AS STRING) AS customer_id,
    CONCAT(u.first_name, ' ', u.last_name) AS customer_name,
    CAST(oi.product_id AS STRING) AS product_id,
    COALESCE(p.name, CONCAT('Product ', CAST(p.id AS STRING))) AS product_name,
    p.category AS category,
    p.department AS department,
    p.brand AS brand,
    oi.status AS status,
    oi.sale_price AS sale_price,
    FORMAT_DATE('%Y-%m-%d', DATE(o.created_at)) AS date
  FROM \`${D}.order_items\` oi
  JOIN \`${D}.orders\` o ON o.order_id = oi.order_id
  JOIN \`${D}.users\` u ON u.id = oi.user_id
  JOIN \`${D}.products\` p ON p.id = oi.product_id
  WHERE o.created_at >= TIMESTAMP(@start_date) AND o.created_at < TIMESTAMP(@end_date)`;

type Extract = {
  order_id: string;
  customer_id: string;
  customer_name: string;
  product_id: string;
  product_name: string;
  category: string;
  department: string;
  brand: string | null;
  status: ItemStatus | "Shipped";
  sale_price: number;
  date: string;
}[];

function fixtureFrom(extract: Extract): Fixture {
  const customers = new Map<string, { id: string; name: string }>();
  const products = new Map<string, Fixture["products"][number]>();
  for (const r of extract) {
    customers.set(r.customer_id, { id: r.customer_id, name: r.customer_name });
    products.set(r.product_id, {
      id: r.product_id,
      name: r.product_name,
      category: r.category,
      department: r.department,
      brand: r.brand,
    });
  }
  return {
    customers: [...customers.values()],
    products: [...products.values()],
    items: extract.map((r) => ({
      orderId: r.order_id,
      customerId: r.customer_id,
      productId: r.product_id,
      date: r.date,
      // The reference counts "Complete" only; any other status is excluded either way.
      status: r.status as ItemStatus,
      salePrice: r.sale_price,
    })),
  };
}

/** Extracts every item of the orders placed in a scope (all statuses). */
async function extractScope(
  runner: ReturnType<typeof createBigQueryRunner>,
  scope: Scope,
): Promise<Extract> {
  const result = await runner.run({
    sql: EXTRACT_SQL,
    params: { start_date: scope.start_date, end_date: scope.end_date },
    types: { start_date: "DATE", end_date: "DATE" },
    maximumBytesBilled: MAX_BYTES_BILLED,
    timeoutMs: QUERY_TIMEOUT_MS,
  });
  return result.rows as Extract;
}

/** Daily rows in a stable order: period, then date. */
const byDay = (a: DailySalesRow, b: DailySalesRow) =>
  a.period.localeCompare(b.period) || a.date.localeCompare(b.date);

/** The category with the most Complete items, so the filter keeps a real share of the days. */
function busiestCategory(extract: Extract): string {
  const counts = new Map<string, number>();
  for (const r of extract)
    if (r.status === "Complete") counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "Jeans";
}

/**
 * Compares the adapter's daily rows with the reference over an extract, exactly (TASK-005 AC-13),
 * and prints the first 3 days with their Complete items for the hand check.
 */
async function expectDailyMatch(
  label: string,
  extract: Extract,
  bigquery: BigQueryDataSource,
  request: DailySalesRequest,
) {
  const reference = (
    await new FixtureDataSource(fixtureFrom(extract)).fetchDailySales(request)
  ).sort(byDay);
  const actual = (await bigquery.fetchDailySales(request)).sort(byDay);
  console.log(`${label}: ${actual.length} daily rows`);
  expect(actual.length).toBeGreaterThan(0);
  expect(actual).toEqual(reference);

  const filter = request.productFilter;
  const sample = actual.slice(0, 3).map((row) => {
    const scope = request.periods.find((p) => p.period === row.period)?.scope as Scope;
    return {
      row,
      items: extract
        .filter(
          (r) =>
            r.status === "Complete" &&
            r.date === row.date &&
            r.date >= scope.start_date &&
            r.date < scope.end_date &&
            (!filter || filter.values.includes(r[filter.field])),
        )
        .map((r) => ({ order: r.order_id, price: r.sale_price })),
    };
  });
  console.log(`HAND CHECK ${label}\n${JSON.stringify(sample, null, 1)}`);
}

const ID: Record<EntityCapabilityId, string> = {
  customer_spending: "customer_id",
  product_sales_performance: "product_id",
};
const byId = (capability: EntityCapabilityId) => (a: ResultRowData, b: ResultRowData) =>
  String(a[ID[capability]]).localeCompare(String(b[ID[capability]]));

describe.skipIf(!projectId)(
  "known-answer check against BigQuery (needs GOOGLE_CLOUD_PROJECT)",
  () => {
    const runner = createBigQueryRunner(projectId as string);
    const bigquery = new BigQueryDataSource(runner);

    for (const { label, scope } of SCOPES) {
      describe(label, () => {
        let extract: Extract;

        it("extracts every item of the orders placed in the scope", async () => {
          extract = await extractScope(runner, scope);
          const statuses = [...new Set(extract.map((r) => r.status))].sort();
          console.log(`${label}: ${extract.length} items, statuses ${statuses.join(", ")}`);
          expect(extract.length).toBeGreaterThan(0);
          expect(statuses).toContain("Complete");
          expect(statuses.filter((s) => s !== "Complete").length).toBeGreaterThan(0);
        });

        for (const capability of ["customer_spending", "product_sales_performance"] as const) {
          it(`${capability} matches the reference rules exactly`, async () => {
            const reference = (
              await new FixtureDataSource(fixtureFrom(extract)).fetch(capability, scope)
            ).sort(byId(capability));
            const actual = (await bigquery.fetch(capability, scope)).sort(byId(capability));
            console.log(`${label} ${capability}: ${actual.length} rows`);
            expect(actual).toEqual(reference);

            // Hand-check material: the first 3 rows with their Complete items.
            const sample = actual.slice(0, 3).map((row) => ({
              row,
              items: extract
                .filter(
                  (r) =>
                    r.status === "Complete" &&
                    (capability === "customer_spending"
                      ? r.customer_id === row.customer_id
                      : r.product_id === row.product_id),
                )
                .map((r) => ({ order: r.order_id, date: r.date, price: r.sale_price })),
            }));
            console.log(`HAND CHECK ${label} ${capability}\n${JSON.stringify(sample, null, 1)}`);
          });
        }

        // TASK-005 AC-13: daily rows of sales_time_series, unfiltered and for one category.
        it("daily sales match the reference rules exactly", async () => {
          await expectDailyMatch(`${label} daily`, extract, bigquery, {
            periods: [{ period: "main", scope }],
          });
        });

        it("daily sales for one category match the reference rules exactly", async () => {
          const category = busiestCategory(extract);
          await expectDailyMatch(`${label} daily, ${category}`, extract, bigquery, {
            periods: [{ period: "main", scope }],
            productFilter: { field: "category", values: [category] },
          });
        });
      });
    }

    describe("daily sales with a comparison period (TASK-005 AC-13)", () => {
      // The month-boundary scope against the same days a year earlier, Women's products only.
      const scope = { start_date: "2025-06-28", end_date: "2025-07-04" };
      const periods = seriesPeriods(scope, { comparison: { baseline: "previous_year" } });

      it("matches the reference rules exactly for both periods", async () => {
        const extracts = await Promise.all(periods.map((p) => extractScope(runner, p.scope)));
        const extract = extracts.flat();
        console.log(`comparison: ${extracts.map((e) => e.length).join(" + ")} items`);
        await expectDailyMatch("comparison, Women", extract, bigquery, {
          periods,
          productFilter: { field: "department", values: ["Women"] },
        });
      });
    });

    describe("realistic scopes: rows, bytes, latency", () => {
      const today = new Date().toISOString().slice(0, 10);
      const yearsBack = (n: number) => `${Number(today.slice(0, 4)) - n}${today.slice(4)}`;
      const scopes = [
        { label: "last 1 year", scope: { start_date: yearsBack(1), end_date: today } },
        { label: "last 5 years", scope: { start_date: yearsBack(5), end_date: today } },
      ];
      for (const { label, scope } of scopes) {
        for (const capability of ["customer_spending", "product_sales_performance"] as const) {
          it(`${capability}, ${label}`, async () => {
            const dry = await runner.run({
              ...BigQueryDataSource.request(capability, scope),
              dryRun: true,
            });
            const started = Date.now();
            const rows = await bigquery.fetch(capability, scope);
            console.log(
              `MEASURE ${capability} ${label}: ${rows.length} rows, ` +
                `${(dry.totalBytesProcessed / 1024 ** 2).toFixed(1)} MB, ${Date.now() - started} ms`,
            );
            expect(rows.length).toBeGreaterThan(0);
          });
        }

        // TASK-005: the daily query at its largest, both periods.
        it(`sales_time_series with the previous period, ${label}`, async () => {
          const request: DailySalesRequest = {
            periods: seriesPeriods(scope, { comparison: { baseline: "previous_period" } }),
          };
          const dry = await runner.run({
            ...BigQueryDataSource.dailySalesRequest(request),
            dryRun: true,
          });
          const started = Date.now();
          const rows = await bigquery.fetchDailySales(request);
          console.log(
            `MEASURE sales_time_series ${label} + previous period: ${rows.length} rows, ` +
              `${(dry.totalBytesProcessed / 1024 ** 2).toFixed(1)} MB, ${Date.now() - started} ms`,
          );
          expect(rows.length).toBeGreaterThan(0);
          expect(rows.length).toBeLessThanOrEqual(TIME_SERIES_ROW_CAP);
        });
      }
    });
  },
);

if (!projectId) {
  describe("known-answer check", () => {
    it.skip("skipped: set GOOGLE_CLOUD_PROJECT in .env and run `gcloud auth application-default login`", () => {});
  });
}
