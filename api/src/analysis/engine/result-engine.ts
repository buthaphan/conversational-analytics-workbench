import { Inject, Injectable } from "@nestjs/common";
import { Prisma, PrismaClient } from "../../generated/prisma/client";
import {
  type AllowedValues,
  type Analysis,
  type AnalysisTarget,
  CAPABILITIES,
  type CapabilityDef,
  type CapabilityId,
  DEFAULT_BRAND_GROUPS,
  type Filter,
  type GroupDimension,
  type Interval,
  MAX_PIE_SLICES,
  type ViewName,
  type TimeSeriesMeasure,
  getField,
  isNumeric,
} from "../capabilities/registry";
import { formatBucketLabel } from "../answers/answers";
import type { ResultRowData } from "../data/data-source";
import type { PeriodScope, SeriesPeriod } from "../data/time-series";

/**
 * Derives the filtered set and displayed rows from the stored complete result, and runs analyses on
 * a named target (TASK-003 AC-8, AC-9). Everything runs as SQL over result_rows (TD-5): field names
 * come only from the capability registry and are checked against a strict pattern before being
 * embedded; every value is a bound parameter.
 */

export interface ViewSettings {
  filters: Filter[];
  sort: { field: string; direction: "asc" | "desc" };
  limit: number;
  /** Which views suit which result shape: `VIEWS_BY_SHAPE` (TASK-005 AC-9). */
  view: ViewName;
  /** Time series only (TASK-005 DEC-002): the bucket size and the charted measure. */
  interval?: Interval;
  measure?: TimeSeriesMeasure;
  /** Product results only (TASK-005 AC-8): the main view shows groups; absent means rows. */
  group_by?: GroupDimension;
  /** Brands shown when grouped by brand (1–30, default 20). */
  groupLimit?: number;
}

/** One group of a grouped product result; measures are the capability's numeric fields. */
export type GroupRow = { key: string; product_count: number } & Record<string, number | string>;

export interface GroupedView {
  groupBy: GroupDimension;
  /** All groups before the "Other" row is formed. */
  groupCount: number;
  rowCount: number;
  /** Rows after the view's filters, which apply before grouping. */
  filteredCount: number;
  groups: GroupRow[];
  /** The groups past the shown ones, combined with exact totals; null when all are shown. */
  other: (GroupRow & { key: "Other"; groups: number }) | null;
  /**
   * Present when the view is a pie (S3): at most 6 slices by the view's measure, the 5 largest
   * plus "Other" when there are more groups, each with its share of the measure. Taken from all
   * groups, so the pie's "Other" also holds brands past the brand cap.
   */
  pie?: {
    measure: string;
    slices: (GroupRow & { share: number })[];
    other: (GroupRow & { key: "Other"; groups: number; share: number }) | null;
  };
}

export interface ViewResult {
  /** Rows in the complete active result set. */
  rowCount: number;
  /** Rows matching the current filters (no sort or limit). */
  filteredCount: number;
  /** The displayed rows: filtered, sorted, limited. */
  rows: ResultRowData[];
}

interface AnalysisBase {
  target: AnalysisTarget;
  /** Rows in the analysed base (states the base in every answer). */
  baseCount: number;
}

export type AnalysisResult =
  | (AnalysisBase & {
      operation: "summary";
      field: string;
      count: number;
      total: number;
      average: number | null;
      median: number | null;
      min: number | null;
      max: number | null;
      /** Time series only (TASK-005 AC-7): the buckets summarized and the extremes' labels. */
      buckets?: { interval: Interval; lowest: string | null; highest: string | null };
    })
  | (AnalysisBase & {
      operation: "concentration";
      measure: string;
      topRows: number;
      topTotal: number;
      total: number;
      share: number | null;
    });

// ---- Time series (TASK-005 AC-5) ---------------------------------------------------------------

export interface SeriesRequest {
  periods: PeriodScope[];
  interval: Interval;
  measure: TimeSeriesMeasure;
  /** YYYY-MM-DD (UTC); the bucket containing it is partial (S7). */
  today: string;
}

export interface SeriesBucket {
  label: string;
  firstDay: string;
  lastDay: string;
  partial: boolean;
  revenue: number;
  order_count: number;
  item_count: number;
}

export type SeriesTotals = Record<TimeSeriesMeasure, number>;

export interface SeriesView {
  interval: Interval;
  measure: TimeSeriesMeasure;
  main: SeriesBucket[];
  comparison?: SeriesBucket[];
  lengthsDiffer: boolean;
  totals: {
    main: SeriesTotals;
    comparison?: SeriesTotals;
    change?: Record<TimeSeriesMeasure, { amount: number; percent: number | null }>;
  };
}

interface BucketRow {
  period: SeriesPeriod;
  /** First day of the whole bucket (ISO week Monday, month's first day), YYYY-MM-DD. */
  bucket: string;
  first_day: string;
  last_day: string;
}

/** The exclusive end of a whole bucket. */
function bucketEnd(interval: Interval, bucketStart: string): string {
  const date = new Date(`${bucketStart}T00:00:00Z`);
  if (interval === "day") date.setUTCDate(date.getUTCDate() + 1);
  else if (interval === "week") date.setUTCDate(date.getUTCDate() + 7);
  else date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 10);
}

/** Change from the comparison period; no % change against a zero total (AC-5). */
function change(main: SeriesTotals, comparison: SeriesTotals): SeriesView["totals"]["change"] {
  const one = (measure: TimeSeriesMeasure) => {
    // Money in whole cents, so the difference is exact.
    const scale = measure === "revenue" ? 100 : 1;
    const base = Math.round(comparison[measure] * scale);
    const diff = Math.round(main[measure] * scale) - base;
    return { amount: diff / scale, percent: base === 0 ? null : diff / base };
  };
  return {
    revenue: one("revenue"),
    order_count: one("order_count"),
    item_count: one("item_count"),
  };
}

/**
 * The summary of a time series (TASK-005 AC-7): over the main period's buckets at the view's
 * interval, naming the first lowest and first highest bucket. Money is handled in whole cents.
 */
export function summarizeSeries(series: SeriesView, field: TimeSeriesMeasure): AnalysisResult {
  const scale = field === "revenue" ? 100 : 1;
  const values = series.main.map((b) => Math.round(b[field] * scale));
  const n = values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const total = values.reduce((sum, v) => sum + v, 0);
  const min = n ? (sorted[0] as number) : null;
  const max = n ? (sorted[n - 1] as number) : null;
  const median =
    n === 0
      ? null
      : n % 2
        ? (sorted[(n - 1) / 2] as number)
        : ((sorted[n / 2 - 1] as number) + (sorted[n / 2] as number)) / 2;
  const labelOf = (v: number | null) =>
    v === null ? null : (series.main[values.indexOf(v)]?.label ?? null);
  const unscale = (v: number | null) => (v === null ? null : v / scale);
  return {
    operation: "summary",
    target: "complete",
    baseCount: n,
    field,
    count: n,
    total: total / scale,
    average: n ? total / n / scale : null,
    median: unscale(median),
    min: unscale(min),
    max: unscale(max),
    buckets: { interval: series.interval, lowest: labelOf(min), highest: labelOf(max) },
  };
}

/** A pie's slices (S3): the largest groups by `measure`, at most `MAX_PIE_SLICES` in all. */
function pieSlices(
  all: GroupRow[],
  measure: string,
  combine: (rest: GroupRow[]) => GroupRow & { key: "Other"; groups: number },
  scaleOf: (name: string) => number,
): NonNullable<GroupedView["pie"]> {
  const scale = scaleOf(measure);
  const value = (g: GroupRow) => Math.round(Number(g[measure]) * scale);
  const largest = [...all].sort((a, b) => value(b) - value(a) || a.key.localeCompare(b.key));
  const drawn = largest.length <= MAX_PIE_SLICES ? largest : largest.slice(0, MAX_PIE_SLICES - 1);
  const rest = largest.slice(drawn.length);
  const total = largest.reduce((s, g) => s + value(g), 0);
  const share = (g: GroupRow) => (total > 0 ? value(g) / total : 0);
  const other = rest.length > 0 ? combine(rest) : null;
  return {
    measure,
    slices: drawn.map((g) => ({ ...g, share: share(g) })),
    other: other ? { ...other, share: share(other) } : null,
  };
}

/** The engine runs on the shared client or on a turn's transaction (TD-6, TD-7). */
export type Db = Pick<Prisma.TransactionClient, "$queryRaw">;

const SAFE_NAME = /^[a-z_]+$/;

function fieldKey(capability: CapabilityDef, name: string): Prisma.Sql {
  const field = getField(capability, name);
  if (!field || !SAFE_NAME.test(field.name)) throw new Error(`Unknown field: ${name}`);
  return Prisma.raw(`'${field.name}'`);
}

const numeric = (capability: CapabilityDef, name: string) =>
  Prisma.sql`((data->>${fieldKey(capability, name)})::numeric)`;
const text = (capability: CapabilityDef, name: string) =>
  Prisma.sql`(data->>${fieldKey(capability, name)})`;
const alias = (name: string) => {
  if (!SAFE_NAME.test(name)) throw new Error(`Unsafe alias: ${name}`);
  return Prisma.raw(`"${name}"`);
};

function filterSql(capability: CapabilityDef, filters: Filter[]): Prisma.Sql {
  if (filters.length === 0) return Prisma.sql`TRUE`;
  const parts = filters.map((f) => {
    if (f.op === "in")
      return Prisma.sql`${text(capability, f.field)} = ANY(${f.values ?? []}::text[])`;
    const expr = numeric(capability, f.field);
    switch (f.op) {
      case "gt":
        return Prisma.sql`${expr} > ${f.value}`;
      case "gte":
        return Prisma.sql`${expr} >= ${f.value}`;
      case "lt":
        return Prisma.sql`${expr} < ${f.value}`;
      case "lte":
        return Prisma.sql`${expr} <= ${f.value}`;
      case "between":
        return Prisma.sql`${expr} BETWEEN ${f.min} AND ${f.max}`;
    }
  });
  return Prisma.join(parts, " AND ");
}

function orderSql(capability: CapabilityDef, settings: ViewSettings): Prisma.Sql {
  const direction = Prisma.raw(settings.sort.direction === "asc" ? "ASC" : "DESC");
  return Prisma.sql`ORDER BY ${numeric(capability, settings.sort.field)} ${direction}, ${text(capability, capability.idField)} ASC`;
}

@Injectable()
export class ResultEngine {
  constructor(@Inject(PrismaClient) private readonly prisma: PrismaClient) {}

  async view(
    resultSetId: string,
    capabilityId: CapabilityId,
    settings: ViewSettings,
    db: Db = this.prisma,
  ): Promise<ViewResult> {
    const capability = CAPABILITIES[capabilityId];
    const where = filterSql(capability, settings.filters);
    const rows = await db.$queryRaw<{ data: ResultRowData }[]>`
      SELECT data FROM result_rows
      WHERE result_set_id = ${resultSetId}::uuid AND ${where}
      ${orderSql(capability, settings)}
      LIMIT ${settings.limit}`;
    const [counts] = await db.$queryRaw<{ total: number; filtered: number }[]>`
      SELECT count(*)::int AS total, (count(*) FILTER (WHERE ${where}))::int AS filtered
      FROM result_rows WHERE result_set_id = ${resultSetId}::uuid`;
    return {
      rowCount: counts?.total ?? 0,
      filteredCount: counts?.filtered ?? 0,
      rows: rows.map((r) => r.data),
    };
  }

  /**
   * Rolls the stored daily rows up to the interval's buckets in SQL (TASK-005 AC-5, S5–S7) and
   * totals each period. Exact: each order falls on one UTC day, so summing days per bucket gives the
   * bucket's distinct orders. Bucket k of the period pairs with bucket k of the comparison period.
   */
  async series(
    resultSetId: string,
    request: SeriesRequest,
    db: Db = this.prisma,
  ): Promise<SeriesView> {
    const sums = Prisma.sql`
      round(sum((data->>'revenue')::numeric), 2)::float8 AS revenue,
      sum((data->>'order_count')::int)::int AS order_count,
      sum((data->>'item_count')::int)::int AS item_count`;
    // The interval is a bound value; date_trunc's 'week' is the ISO week (Monday, S6).
    const buckets = await db.$queryRaw<(SeriesTotals & BucketRow)[]>`
      SELECT data->>'period' AS period,
             date_trunc(${request.interval}, (data->>'date')::timestamp)::date::text AS bucket,
             min(data->>'date') AS first_day, max(data->>'date') AS last_day, ${sums}
      FROM result_rows WHERE result_set_id = ${resultSetId}::uuid
      GROUP BY 1, 2 ORDER BY 2`;
    const totalRows = await db.$queryRaw<(SeriesTotals & { period: SeriesPeriod })[]>`
      SELECT data->>'period' AS period, ${sums}
      FROM result_rows WHERE result_set_id = ${resultSetId}::uuid GROUP BY 1`;

    const bucketsOf = (period: SeriesPeriod): SeriesBucket[] | undefined => {
      const scope = request.periods.find((p) => p.period === period)?.scope;
      if (!scope) return undefined;
      return buckets
        .filter((b) => b.period === period)
        .map((b) => {
          const naturalEnd = bucketEnd(request.interval, b.bucket);
          return {
            label: formatBucketLabel(request.interval, b.bucket),
            firstDay: b.first_day,
            lastDay: b.last_day,
            partial:
              b.bucket < scope.start_date ||
              naturalEnd > scope.end_date ||
              (b.bucket <= request.today && request.today < naturalEnd),
            revenue: b.revenue,
            order_count: b.order_count,
            item_count: b.item_count,
          };
        });
    };
    const totalsOf = (period: SeriesPeriod): SeriesTotals | undefined => {
      if (!request.periods.some((p) => p.period === period)) return undefined;
      const row = totalRows.find((t) => t.period === period);
      return {
        revenue: row?.revenue ?? 0,
        order_count: row?.order_count ?? 0,
        item_count: row?.item_count ?? 0,
      };
    };

    const main = bucketsOf("main") ?? [];
    const comparison = bucketsOf("comparison");
    const mainTotals = totalsOf("main") as SeriesTotals;
    const comparisonTotals = totalsOf("comparison");
    return {
      interval: request.interval,
      measure: request.measure,
      main,
      ...(comparison ? { comparison } : {}),
      lengthsDiffer: comparison !== undefined && comparison.length !== main.length,
      totals: {
        main: mainTotals,
        ...(comparisonTotals
          ? { comparison: comparisonTotals, change: change(mainTotals, comparisonTotals) }
          : {}),
      },
    };
  }

  async allowedValues(
    resultSetId: string,
    capabilityId: CapabilityId,
    db: Db = this.prisma,
  ): Promise<AllowedValues> {
    const capability = CAPABILITIES[capabilityId];
    const allowed: AllowedValues = {};
    for (const field of capability.fields.filter((f) => f.kind === "category")) {
      const values = await db.$queryRaw<{ value: string }[]>`
        SELECT DISTINCT ${text(capability, field.name)} AS value FROM result_rows
        WHERE result_set_id = ${resultSetId}::uuid ORDER BY 1`;
      allowed[field.name] = values.map((v) => v.value);
    }
    return allowed;
  }

  async analyze(
    resultSetId: string,
    capabilityId: CapabilityId,
    settings: ViewSettings,
    analysis: Analysis,
    db: Db = this.prisma,
  ): Promise<AnalysisResult> {
    const capability = CAPABILITIES[capabilityId];
    const base = this.baseSql(capability, resultSetId, settings, analysis.target);
    if (analysis.operation === "summary") return this.summary(db, capability, base, analysis);
    return this.concentration(db, capability, base, analysis);
  }

  /**
   * The grouped view (TASK-005 AC-8): the view's filters apply first, then products are grouped
   * by the dimension with their count and summed measures, sorted by the view's measure and
   * direction (ties by name). Brands beyond `groupLimit` (default 20) are combined into one "Other"
   * row; category and department groups are all shown.
   */
  async groups(
    resultSetId: string,
    capabilityId: CapabilityId,
    settings: ViewSettings,
    db: Db = this.prisma,
  ): Promise<GroupedView> {
    const capability = CAPABILITIES[capabilityId];
    const groupBy = settings.group_by;
    if (!groupBy || !capability.groupByFields.includes(groupBy))
      throw new Error(`Cannot group by ${groupBy ?? "nothing"}.`);
    const measures = capability.fields.filter(isNumeric);
    const sums = Prisma.join(
      measures.map((f) =>
        f.kind === "money"
          ? Prisma.sql`round(sum(${numeric(capability, f.name)}), 2)::float8 AS ${alias(f.name)}`
          : Prisma.sql`sum(${numeric(capability, f.name)})::float8 AS ${alias(f.name)}`,
      ),
      ", ",
    );
    const direction = Prisma.raw(settings.sort.direction === "asc" ? "ASC" : "DESC");
    const where = filterSql(capability, settings.filters);
    const all = await db.$queryRaw<GroupRow[]>`
      SELECT ${text(capability, groupBy)} AS key, count(*)::int AS product_count, ${sums}
      FROM result_rows WHERE result_set_id = ${resultSetId}::uuid AND ${where}
      GROUP BY 1 ORDER BY ${alias(settings.sort.field)} ${direction}, 1 ASC`;
    const [counts] = await db.$queryRaw<{ total: number; filtered: number }[]>`
      SELECT count(*)::int AS total, (count(*) FILTER (WHERE ${where}))::int AS filtered
      FROM result_rows WHERE result_set_id = ${resultSetId}::uuid`;

    const shown = groupBy === "brand" ? (settings.groupLimit ?? DEFAULT_BRAND_GROUPS) : all.length;
    // Money in whole cents, so every combined total is exact.
    const scaleOf = (name: string) => (getField(capability, name)?.kind === "money" ? 100 : 1);
    const combine = (rest: GroupRow[]): GroupRow & { key: "Other"; groups: number } => {
      const other: GroupRow & { key: "Other"; groups: number } = {
        key: "Other",
        groups: rest.length,
        product_count: rest.reduce((s, g) => s + g.product_count, 0),
      };
      for (const f of measures) {
        const scale = scaleOf(f.name);
        other[f.name] = rest.reduce((s, g) => s + Math.round(Number(g[f.name]) * scale), 0) / scale;
      }
      return other;
    };
    const rest = all.slice(shown);
    return {
      groupBy,
      groupCount: all.length,
      rowCount: counts?.total ?? 0,
      filteredCount: counts?.filtered ?? 0,
      groups: all.slice(0, shown),
      other: rest.length > 0 ? combine(rest) : null,
      ...(settings.view === "pie"
        ? { pie: pieSlices(all, settings.sort.field, combine, scaleOf) }
        : {}),
    };
  }

  /** The rows an analysis runs on: complete (default), filtered, or displayed (AC-9). */
  private baseSql(
    capability: CapabilityDef,
    resultSetId: string,
    settings: ViewSettings,
    target: AnalysisTarget,
  ): Prisma.Sql {
    const all = Prisma.sql`SELECT data FROM result_rows WHERE result_set_id = ${resultSetId}::uuid`;
    if (target === "complete") return all;
    const filtered = Prisma.sql`${all} AND ${filterSql(capability, settings.filters)}`;
    if (target === "filtered") return filtered;
    return Prisma.sql`${filtered} ${orderSql(capability, settings)} LIMIT ${settings.limit}`;
  }

  private async summary(
    db: Db,
    capability: CapabilityDef,
    base: Prisma.Sql,
    analysis: Analysis,
  ): Promise<AnalysisResult> {
    const field = analysis.field as string;
    const [row] = await db.$queryRaw<
      {
        count: number;
        total: number;
        average: number | null;
        median: number | null;
        min: number | null;
        max: number | null;
      }[]
    >`
      WITH base AS (${base})
      SELECT count(*)::int AS count, coalesce(sum(v), 0)::float8 AS total, avg(v)::float8 AS average,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY v::float8) AS median,
             min(v)::float8 AS min, max(v)::float8 AS max
      FROM (SELECT ${numeric(capability, field)} AS v FROM base) values_`;
    const stats = row as NonNullable<typeof row>;
    return {
      operation: "summary",
      target: analysis.target,
      baseCount: stats.count,
      field,
      ...stats,
    };
  }

  private async concentration(
    db: Db,
    capability: CapabilityDef,
    base: Prisma.Sql,
    analysis: Analysis,
  ): Promise<AnalysisResult> {
    const measure = analysis.measure as string;
    const m = numeric(capability, measure);
    const k =
      analysis.top_count !== undefined
        ? Prisma.sql`${analysis.top_count}::bigint`
        : Prisma.sql`CEIL(${analysis.top_percent}::numeric * n / 100)`;
    const [row] = await db.$queryRaw<{ n: number; total: number; top: number; k: number }[]>`
      WITH base AS (${base}),
      ranked AS (
        SELECT ${m} AS m,
               row_number() OVER (ORDER BY ${m} DESC, ${text(capability, capability.idField)} ASC) AS rn,
               count(*) OVER () AS n
        FROM base
      ),
      bounded AS (SELECT m, rn, n, LEAST(n, ${k}) AS k FROM ranked)
      SELECT coalesce(max(n), 0)::int AS n, coalesce(sum(m), 0)::float8 AS total,
             coalesce(sum(m) FILTER (WHERE rn <= k), 0)::float8 AS top, coalesce(max(k), 0)::int AS k
      FROM bounded`;
    const stats = row as NonNullable<typeof row>;
    return {
      operation: "concentration",
      target: analysis.target,
      baseCount: stats.n,
      measure,
      topRows: stats.k,
      topTotal: stats.top,
      total: stats.total,
      share: stats.total > 0 ? stats.top / stats.total : null,
    };
  }
}
