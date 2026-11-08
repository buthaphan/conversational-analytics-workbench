import { BigQuery } from "@google-cloud/bigquery";
import { CAPABILITIES, type CapabilityId, type Scope } from "../capabilities/registry";
import { DataSource, type ResultRowData } from "./data-source";
import { fromCents } from "./money";

/**
 * TheLook in BigQuery (TASK-004 AC-6). This is the only file that imports the BigQuery SDK
 * (AC-4); everything else goes through `QueryRunner`, so tests use a fake runner.
 *
 * One fixed query per capability, matching the reference rules (`FixtureDataSource`, TD-12) and
 * docs/product/THELOOK-PROFILE.md: only `Complete` items count; the window is the order's
 * placement date in UTC (`orders.created_at`); each item is rounded to whole cents before summing.
 * Scope dates are query parameters only. No sort or limit except the over-cap guard
 * (`LIMIT rowCap + 1`), so the orchestrator can refuse an over-cap scope without the whole transfer.
 */

/** The public dataset's location; every job runs there. */
export const THELOOK_LOCATION = "US";
export const THELOOK_DATASET = "bigquery-public-data.thelook_ecommerce";
/** Each capability query processes about 5–10 MB; this stops a mistaken query early. */
export const MAX_BYTES_BILLED = 1024 ** 3;
export const QUERY_TIMEOUT_MS = 30_000;

const D = THELOOK_DATASET;
const COMPLETED_IN_SCOPE = `
  FROM \`${D}.order_items\` oi
  JOIN \`${D}.orders\` o ON o.order_id = oi.order_id
  {join}
  WHERE oi.status = 'Complete'
    AND o.created_at >= TIMESTAMP(@start_date)
    AND o.created_at < TIMESTAMP(@end_date)`;
const ITEM_CENTS = "CAST(ROUND(oi.sale_price * 100) AS INT64)";

export const CAPABILITY_SQL: Record<CapabilityId, string> = {
  customer_spending: `
  SELECT
    CAST(u.id AS STRING) AS customer_id,
    CONCAT(u.first_name, ' ', u.last_name) AS customer_name,
    SUM(${ITEM_CENTS}) AS spend_cents,
    COUNT(DISTINCT oi.order_id) AS order_count
  ${COMPLETED_IN_SCOPE.replace("{join}", `JOIN \`${D}.users\` u ON u.id = oi.user_id`)}
  GROUP BY u.id, u.first_name, u.last_name
  LIMIT @row_limit`,
  product_sales_performance: `
  SELECT
    CAST(p.id AS STRING) AS product_id,
    COALESCE(p.name, CONCAT('Product ', CAST(p.id AS STRING))) AS product_name,
    p.category AS category,
    SUM(${ITEM_CENTS}) AS revenue_cents,
    COUNT(*) AS item_count
  ${COMPLETED_IN_SCOPE.replace("{join}", `JOIN \`${D}.products\` p ON p.id = oi.product_id`)}
  GROUP BY p.id, p.name, p.category
  LIMIT @row_limit`,
};

/** A retrieval failed. The message never includes the cause, the project, or the scope. */
export class BigQueryRetrievalError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("The BigQuery retrieval failed.", options);
    this.name = "BigQueryRetrievalError";
  }
}

export class BigQueryDataSource extends DataSource {
  constructor(private readonly runner: QueryRunner) {
    super();
  }

  /** The job request for a capability and scope; exported for the dry run in the live check. */
  static request(capability: CapabilityId, scope: Scope): QueryRequest {
    return {
      sql: CAPABILITY_SQL[capability],
      params: {
        start_date: scope.start_date,
        end_date: scope.end_date,
        row_limit: CAPABILITIES[capability].rowCap + 1,
      },
      types: { start_date: "DATE", end_date: "DATE", row_limit: "INT64" },
      maximumBytesBilled: MAX_BYTES_BILLED,
      timeoutMs: QUERY_TIMEOUT_MS,
    };
  }

  async fetch(capability: CapabilityId, scope: Scope): Promise<ResultRowData[]> {
    let result: QueryResult;
    try {
      result = await this.runner.run(BigQueryDataSource.request(capability, scope));
    } catch (cause) {
      throw new BigQueryRetrievalError({ cause });
    }
    try {
      return result.rows.map(capability === "customer_spending" ? customerRow : productRow);
    } catch (cause) {
      throw new BigQueryRetrievalError({ cause });
    }
  }
}

function text(value: unknown): string {
  if (typeof value === "string" && value !== "") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  throw new Error("Expected a non-empty string.");
}

/** INT64 values may arrive as numbers or numeric strings. */
function whole(value: unknown, min = 0): number {
  const n = typeof value === "string" && /^-?\d+$/.test(value) ? Number(value) : value;
  if (typeof n !== "number" || !Number.isSafeInteger(n) || n < min)
    throw new Error("Expected a whole number.");
  return n;
}

function customerRow(row: Record<string, unknown>): ResultRowData {
  const cents = whole(row.spend_cents);
  const orders = whole(row.order_count, 1);
  return {
    customer_id: text(row.customer_id),
    customer_name: text(row.customer_name),
    total_spend: fromCents(cents),
    order_count: orders,
    avg_order_value: fromCents(cents / orders),
  };
}

function productRow(row: Record<string, unknown>): ResultRowData {
  return {
    product_id: text(row.product_id),
    product_name: text(row.product_name),
    category: text(row.category),
    revenue: fromCents(whole(row.revenue_cents)),
    item_count: whole(row.item_count, 1),
  };
}

export interface QueryRequest {
  sql: string;
  /** Named parameters (`@name` in the SQL). Never interpolated into the SQL text. */
  params: Record<string, string | number>;
  /** BigQuery types of the parameters, e.g. `{ start_date: "DATE" }`. */
  types?: Record<string, string>;
  /** The job fails instead of scanning more than this. */
  maximumBytesBilled: number;
  timeoutMs: number;
  dryRun?: boolean;
}

export interface QueryResult {
  rows: Record<string, unknown>[];
  totalBytesProcessed: number;
}

export interface QueryRunner {
  run(request: QueryRequest): Promise<QueryResult>;
}

/**
 * Parameters in the form the SDK needs. A plain string declared as `DATE` reaches BigQuery as NULL
 * (found by the live known-answer run), so DATE values become `BigQuery.date` objects.
 */
export function sdkParams(
  params: QueryRequest["params"],
  types: QueryRequest["types"],
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(params).map(([name, value]) => [
      name,
      types?.[name] === "DATE" ? BigQuery.date(String(value)) : value,
    ]),
  );
}

/** Runs queries with Google application default credentials, billed to `projectId`. */
export function createBigQueryRunner(projectId: string): QueryRunner {
  const client = new BigQuery({ projectId });
  return {
    async run(request) {
      const [job] = await client.createQueryJob({
        query: request.sql,
        params: sdkParams(request.params, request.types),
        ...(request.types ? { types: request.types } : {}),
        location: THELOOK_LOCATION,
        useLegacySql: false,
        maximumBytesBilled: String(request.maximumBytesBilled),
        jobTimeoutMs: request.timeoutMs,
        ...(request.dryRun ? { dryRun: true } : {}),
      });
      if (request.dryRun) {
        return {
          rows: [],
          totalBytesProcessed: Number(job.metadata?.statistics?.totalBytesProcessed ?? 0),
        };
      }
      const [rows] = await job.getQueryResults({ timeoutMs: request.timeoutMs });
      const [metadata] = await job.getMetadata();
      return {
        rows: rows as Record<string, unknown>[],
        totalBytesProcessed: Number(metadata?.statistics?.totalBytesProcessed ?? 0),
      };
    },
  };
}
