import { Inject, Injectable } from "@nestjs/common";
import { Prisma, PrismaClient } from "../../generated/prisma/client";
import {
  type AllowedValues,
  type Analysis,
  type AnalysisTarget,
  CAPABILITIES,
  type CapabilityDef,
  type CapabilityId,
  type Filter,
  getField,
  isNumeric,
} from "../capabilities/registry";
import type { ResultRowData } from "../data/data-source";

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
  view: "bar" | "table";
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
    })
  | (AnalysisBase & {
      operation: "concentration";
      measure: string;
      topRows: number;
      topTotal: number;
      total: number;
      share: number | null;
    })
  | (AnalysisBase & {
      operation: "group";
      groupBy: string;
      groups: ({ key: string; rows: number } & Record<string, number | string>)[];
    });

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
    if (analysis.operation === "concentration")
      return this.concentration(db, capability, base, analysis);
    return this.group(db, capability, base, analysis);
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

  private async group(
    db: Db,
    capability: CapabilityDef,
    base: Prisma.Sql,
    analysis: Analysis,
  ): Promise<AnalysisResult> {
    const groupBy = analysis.group_by as string;
    const measures = capability.fields.filter(isNumeric);
    const sums = Prisma.join(
      measures.map(
        (f) => Prisma.sql`sum(${numeric(capability, f.name)})::float8 AS ${alias(f.name)}`,
      ),
      ", ",
    );
    const firstMeasure = alias((measures[0] as { name: string }).name);
    const groups = await db.$queryRaw<
      ({ key: string; rows: number } & Record<string, number | string>)[]
    >`
      WITH base AS (${base})
      SELECT ${text(capability, groupBy)} AS key, count(*)::int AS rows, ${sums}
      FROM base GROUP BY 1 ORDER BY ${firstMeasure} DESC, 1 ASC`;
    return {
      operation: "group",
      target: analysis.target,
      baseCount: groups.reduce((sum, g) => sum + g.rows, 0),
      groupBy,
      groups,
    };
  }
}
