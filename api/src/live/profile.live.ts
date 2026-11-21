import { describe, expect, it } from "vitest";
import {
  THELOOK_DATASET as D,
  type QueryRunner,
  createBigQueryRunner,
} from "../analysis/data/bigquery-data-source";

/**
 * TheLook profile (TASK-004 AC-5, TASK-005 AC-1). Read-only queries against the public dataset;
 * results are printed and summarised by hand in docs/product/THELOOK-PROFILE.md.
 * Run: npm run live:profile -w api (only the TASK-005 queries: add `-- -t task005`)
 */
const projectId = process.env.GOOGLE_CLOUD_PROJECT?.trim();
const GB = 1024 ** 3;

const QUERIES: Record<string, string> = {
  tables: `SELECT table_id, row_count, size_bytes FROM \`${D}.__TABLES__\` ORDER BY table_id`,
  columns: `
    SELECT table_name, column_name, data_type, is_nullable, is_partitioning_column,
      clustering_ordinal_position
    FROM \`${D}.INFORMATION_SCHEMA.COLUMNS\`
    WHERE table_name IN ('order_items', 'orders', 'users', 'products')
    ORDER BY table_name, ordinal_position`,
  item_statuses: `SELECT status, COUNT(*) AS items FROM \`${D}.order_items\` GROUP BY status ORDER BY items DESC`,
  item_coverage_and_nulls: `
    SELECT
      COUNT(*) AS items,
      MIN(created_at) AS min_created, MAX(created_at) AS max_created,
      MIN(shipped_at) AS min_shipped, MAX(shipped_at) AS max_shipped,
      MIN(delivered_at) AS min_delivered, MAX(delivered_at) AS max_delivered,
      COUNTIF(created_at IS NULL) AS null_created, COUNTIF(shipped_at IS NULL) AS null_shipped,
      COUNTIF(delivered_at IS NULL) AS null_delivered, COUNTIF(returned_at IS NULL) AS null_returned,
      COUNTIF(user_id IS NULL) AS null_user, COUNTIF(order_id IS NULL) AS null_order,
      COUNTIF(product_id IS NULL) AS null_product, COUNTIF(sale_price IS NULL) AS null_price,
      COUNTIF(status IS NULL) AS null_status,
      COUNTIF(created_at > CURRENT_TIMESTAMP()) AS created_in_future
    FROM \`${D}.order_items\``,
  timestamps_by_status: `
    SELECT status,
      COUNTIF(shipped_at IS NULL) AS no_shipped, COUNTIF(delivered_at IS NULL) AS no_delivered,
      COUNTIF(returned_at IS NULL) AS no_returned, COUNT(*) AS items
    FROM \`${D}.order_items\` GROUP BY status ORDER BY status`,
  complete_items_by_year: `
    SELECT EXTRACT(YEAR FROM created_at) AS year, COUNT(*) AS items,
      COUNT(DISTINCT user_id) AS customers, COUNT(DISTINCT product_id) AS products,
      COUNT(DISTINCT order_id) AS orders
    FROM \`${D}.order_items\` WHERE status = 'Complete' GROUP BY year ORDER BY year`,
  prices: `
    SELECT MIN(oi.sale_price) AS min_price, MAX(oi.sale_price) AS max_price,
      COUNTIF(oi.sale_price <= 0) AS non_positive,
      COUNTIF(oi.sale_price != ROUND(oi.sale_price, 2)) AS more_than_2_decimals,
      COUNTIF(ABS(oi.sale_price - p.retail_price) > 0.005) AS differs_from_retail,
      COUNTIF(p.id IS NULL) AS no_product
    FROM \`${D}.order_items\` oi LEFT JOIN \`${D}.products\` p ON p.id = oi.product_id`,
  item_vs_order: `
    SELECT
      COUNTIF(o.order_id IS NULL) AS no_order,
      COUNTIF(o.status != oi.status) AS status_differs,
      COUNTIF(DATE(o.created_at) != DATE(oi.created_at)) AS date_differs,
      COUNTIF(o.user_id != oi.user_id) AS user_differs
    FROM \`${D}.order_items\` oi LEFT JOIN \`${D}.orders\` o ON o.order_id = oi.order_id`,
  item_vs_order_time_gap: `
    SELECT
      COUNTIF(oi.created_at < o.created_at) AS item_before_order,
      MIN(TIMESTAMP_DIFF(oi.created_at, o.created_at, HOUR)) AS min_gap_hours,
      APPROX_QUANTILES(TIMESTAMP_DIFF(oi.created_at, o.created_at, HOUR), 4) AS gap_hours_quartiles,
      MAX(TIMESTAMP_DIFF(oi.created_at, o.created_at, HOUR)) AS max_gap_hours,
      COUNTIF(DATE(oi.created_at) != DATE(o.created_at)) AS items_on_other_date
    FROM \`${D}.order_items\` oi JOIN \`${D}.orders\` o ON o.order_id = oi.order_id`,
  orders_split_across_dates: `
    SELECT COUNT(*) AS orders FROM (
      SELECT order_id FROM \`${D}.order_items\` GROUP BY order_id
      HAVING COUNT(DISTINCT DATE(created_at)) > 1)`,
  orders_with_mixed_item_statuses: `
    SELECT COUNT(*) AS orders FROM (
      SELECT order_id FROM \`${D}.order_items\` GROUP BY order_id HAVING COUNT(DISTINCT status) > 1)`,
  names_and_categories: `
    SELECT
      (SELECT COUNTIF(first_name IS NULL OR last_name IS NULL) FROM \`${D}.users\`) AS users_missing_name,
      (SELECT COUNT(*) FROM \`${D}.order_items\` oi LEFT JOIN \`${D}.users\` u ON u.id = oi.user_id
        WHERE u.id IS NULL) AS items_without_user,
      (SELECT COUNTIF(name IS NULL) FROM \`${D}.products\`) AS products_missing_name,
      (SELECT COUNTIF(category IS NULL) FROM \`${D}.products\`) AS products_missing_category,
      (SELECT COUNT(DISTINCT category) FROM \`${D}.products\`) AS categories,
      (SELECT MAX(LENGTH(name)) FROM \`${D}.products\`) AS longest_product_name,
      (SELECT COUNT(*) FROM (SELECT name FROM \`${D}.products\` GROUP BY name HAVING COUNT(*) > 1))
        AS duplicated_product_names`,
  category_values: `SELECT category, COUNT(*) AS products FROM \`${D}.products\` GROUP BY category ORDER BY category`,
  rows_per_scope: `
    WITH scopes AS (
      SELECT label, start_date, end_date FROM UNNEST([
        STRUCT('last 1 year' AS label, DATE_SUB(CURRENT_DATE(), INTERVAL 1 YEAR) AS start_date, CURRENT_DATE() AS end_date),
        STRUCT('last 2 years', DATE_SUB(CURRENT_DATE(), INTERVAL 2 YEAR), CURRENT_DATE()),
        STRUCT('last 5 years', DATE_SUB(CURRENT_DATE(), INTERVAL 5 YEAR), CURRENT_DATE()),
        STRUCT('calendar 2025', DATE '2025-01-01', DATE '2026-01-01')
      ])
    )
    SELECT s.label, COUNT(DISTINCT oi.user_id) AS customers, COUNT(DISTINCT oi.product_id) AS products,
      COUNT(*) AS items
    FROM scopes s JOIN \`${D}.order_items\` oi
      ON oi.status = 'Complete' AND DATE(oi.created_at) >= s.start_date AND DATE(oi.created_at) < s.end_date
    GROUP BY s.label ORDER BY s.label`,

  // ---- TASK-005 AC-1: department, brand, and daily sales. Same rules as the capability queries:
  // Complete items only, window on the order's UTC date. Run only these: `-t task005`.
  task005_departments: `
    SELECT department, COUNT(*) AS products, COUNT(DISTINCT category) AS categories
    FROM \`${D}.products\` GROUP BY department ORDER BY department`,
  task005_categories_per_department: `
    SELECT category, STRING_AGG(DISTINCT department ORDER BY department) AS departments
    FROM \`${D}.products\` GROUP BY category ORDER BY category`,
  task005_brand_values: `
    SELECT
      COUNT(DISTINCT brand) AS brands,
      COUNTIF(brand IS NULL) AS null_brand,
      COUNTIF(brand IS NOT NULL AND TRIM(brand) = '') AS blank_brand,
      COUNTIF(brand IS NOT NULL AND brand != TRIM(brand)) AS untrimmed_brand,
      MAX(LENGTH(brand)) AS longest_brand,
      COUNTIF(department IS NULL) AS null_department,
      (SELECT COUNT(*) FROM (
        SELECT LOWER(TRIM(brand)) FROM \`${D}.products\` WHERE brand IS NOT NULL
        GROUP BY 1 HAVING COUNT(DISTINCT brand) > 1)) AS brands_differing_only_by_case_or_space
    FROM \`${D}.products\``,
  task005_products_per_brand: `
    SELECT APPROX_QUANTILES(n, 10) AS products_per_brand_deciles, MAX(n) AS max_products
    FROM (SELECT brand, COUNT(*) AS n FROM \`${D}.products\` GROUP BY brand)`,
  task005_brand_revenue_spread: `
    WITH sales AS (
      SELECT s.label, p.brand, SUM(CAST(ROUND(oi.sale_price * 100) AS INT64)) AS cents
      FROM UNNEST([
        STRUCT('last 1 year' AS label, DATE_SUB(CURRENT_DATE(), INTERVAL 1 YEAR) AS start_date),
        STRUCT('last 5 years', DATE_SUB(CURRENT_DATE(), INTERVAL 5 YEAR))
      ]) s
      JOIN \`${D}.orders\` o ON DATE(o.created_at) >= s.start_date AND DATE(o.created_at) < CURRENT_DATE()
      JOIN \`${D}.order_items\` oi ON oi.order_id = o.order_id AND oi.status = 'Complete'
      JOIN \`${D}.products\` p ON p.id = oi.product_id
      GROUP BY s.label, p.brand
    ),
    ranked AS (
      SELECT label, cents, ROW_NUMBER() OVER (PARTITION BY label ORDER BY cents DESC) AS rn
      FROM sales
    )
    SELECT label, COUNT(*) AS brands_with_sales,
      ROUND(SUM(IF(rn <= 5, cents, 0)) / SUM(cents), 3) AS top5_share,
      ROUND(SUM(IF(rn <= 20, cents, 0)) / SUM(cents), 3) AS top20_share,
      ROUND(SUM(IF(rn <= 30, cents, 0)) / SUM(cents), 3) AS top30_share
    FROM ranked GROUP BY label ORDER BY label`,
  task005_daily_sales: `
    WITH days AS (
      SELECT s.label, DATE(o.created_at) AS day,
        COUNT(*) AS items, COUNT(DISTINCT o.order_id) AS orders,
        SUM(CAST(ROUND(oi.sale_price * 100) AS INT64)) AS cents
      FROM UNNEST([
        STRUCT('last 1 year' AS label, DATE_SUB(CURRENT_DATE(), INTERVAL 1 YEAR) AS start_date),
        STRUCT('last 5 years', DATE_SUB(CURRENT_DATE(), INTERVAL 5 YEAR))
      ]) s
      JOIN \`${D}.orders\` o ON DATE(o.created_at) >= s.start_date AND DATE(o.created_at) < CURRENT_DATE()
      JOIN \`${D}.order_items\` oi ON oi.order_id = o.order_id AND oi.status = 'Complete'
      GROUP BY s.label, day
    )
    SELECT label,
      COUNT(*) AS days_with_sales,
      DATE_DIFF(CURRENT_DATE(), MIN(day), DAY) AS days_since_first_sale,
      MIN(items) AS min_items, MAX(items) AS max_items,
      MIN(orders) AS min_orders, MAX(orders) AS max_orders,
      MIN(cents) / 100 AS min_revenue, MAX(cents) / 100 AS max_revenue
    FROM days GROUP BY label ORDER BY label`,
  task005_future_dated_orders: `
    SELECT COUNT(DISTINCT o.order_id) AS orders_after_today, COUNT(*) AS complete_items_after_today,
      MAX(DATE(o.created_at)) AS latest_order_date
    FROM \`${D}.orders\` o
    JOIN \`${D}.order_items\` oi ON oi.order_id = o.order_id AND oi.status = 'Complete'
    WHERE DATE(o.created_at) >= CURRENT_DATE()`,
  // Draft capability queries (last 5 years), counted rather than printed: rows and bytes processed.
  task005_draft_product_query_5y: `
    SELECT COUNT(*) AS row_count FROM (
      SELECT p.id, p.name, p.category, p.department, p.brand,
        SUM(CAST(ROUND(oi.sale_price * 100) AS INT64)) AS revenue_cents, COUNT(*) AS item_count
      FROM \`${D}.order_items\` oi
      JOIN \`${D}.orders\` o ON o.order_id = oi.order_id
      JOIN \`${D}.products\` p ON p.id = oi.product_id
      WHERE oi.status = 'Complete'
        AND o.created_at >= TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL 5 YEAR))
        AND o.created_at < TIMESTAMP(CURRENT_DATE())
      GROUP BY p.id, p.name, p.category, p.department, p.brand)`,
  task005_draft_daily_query_5y: `
    SELECT COUNT(*) AS row_count FROM (
      SELECT DATE(o.created_at) AS day,
        SUM(CAST(ROUND(oi.sale_price * 100) AS INT64)) AS revenue_cents,
        COUNT(DISTINCT oi.order_id) AS order_count, COUNT(*) AS item_count
      FROM \`${D}.order_items\` oi
      JOIN \`${D}.orders\` o ON o.order_id = oi.order_id
      JOIN \`${D}.products\` p ON p.id = oi.product_id
      WHERE oi.status = 'Complete'
        AND o.created_at >= TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL 5 YEAR))
        AND o.created_at < TIMESTAMP(CURRENT_DATE())
        AND p.category IN UNNEST(['Jeans', 'Sweaters'])
      GROUP BY day)`,
};

describe.skipIf(!projectId)("TheLook profile (needs GOOGLE_CLOUD_PROJECT)", () => {
  const runner: QueryRunner = createBigQueryRunner(projectId as string);

  for (const [name, sql] of Object.entries(QUERIES)) {
    it(name, async () => {
      const { rows, totalBytesProcessed } = await runner.run({
        sql,
        params: {},
        maximumBytesBilled: GB,
        timeoutMs: 60_000,
      });
      console.log(
        `\n### ${name} (${(totalBytesProcessed / 1024 ** 2).toFixed(1)} MB processed)\n` +
          JSON.stringify(rows, (_k, v) => (typeof v === "object" && v?.value ? v.value : v), 1),
      );
      expect(Array.isArray(rows)).toBe(true);
    });
  }
});

if (!projectId) {
  describe("TheLook profile", () => {
    it.skip("skipped: set GOOGLE_CLOUD_PROJECT in .env and run `gcloud auth application-default login`", () => {});
  });
}
