import {
  type ProductFilter,
  type RequestParameters,
  type Scope,
  comparisonPeriod,
} from "../capabilities/registry";

/**
 * Daily sales for `sales_time_series` (TASK-005 AC-4, S5, S7). Adapters return only days with
 * completed sales; this shared code, not the adapters, fills days without sales with zeros and
 * drops days after today, so the fixture and BigQuery cannot differ on those rules.
 */

export type SeriesPeriod = "main" | "comparison";

export interface PeriodScope {
  period: SeriesPeriod;
  scope: Scope;
}

/** One UTC day of one period; stored as a result row. Revenue is in USD, exact to the cent. */
export interface DailySalesRow {
  [field: string]: string | number;
  period: SeriesPeriod;
  /** YYYY-MM-DD */
  date: string;
  revenue: number;
  order_count: number;
  item_count: number;
}

/** What an adapter retrieves: each period's days, optionally for some products only. */
export interface DailySalesRequest {
  periods: PeriodScope[];
  productFilter?: ProductFilter;
}

/** The main period, then the comparison period when one is asked for. */
export function seriesPeriods(scope: Scope, parameters: RequestParameters): PeriodScope[] {
  const periods: PeriodScope[] = [{ period: "main", scope }];
  if (parameters.comparison)
    periods.push({ period: "comparison", scope: comparisonPeriod(scope, parameters.comparison) });
  return periods;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function* daysOf(scope: Scope): Generator<string> {
  const end = Date.parse(`${scope.end_date}T00:00:00Z`);
  for (let t = Date.parse(`${scope.start_date}T00:00:00Z`); t < end; t += DAY_MS)
    yield new Date(t).toISOString().slice(0, 10);
}

/**
 * Every day of each period up to and including `today` (UTC), main period first and in date
 * order; a day without sales is a zero row. An adapter row outside its period, for a period that
 * was not requested, or repeated is a retrieval error.
 */
export function completeDailySeries(
  rows: DailySalesRow[],
  periods: PeriodScope[],
  today: string,
): DailySalesRow[] {
  const byPeriod = new Map(periods.map((p) => [p.period, new Map<string, DailySalesRow>()]));
  for (const row of rows) {
    const days = byPeriod.get(row.period);
    const scope = periods.find((p) => p.period === row.period)?.scope;
    if (!days || !scope) throw new Error("A daily row belongs to no requested period.");
    if (row.date < scope.start_date || row.date >= scope.end_date)
      throw new Error("A daily row lies outside its period.");
    if (days.has(row.date)) throw new Error("A day was returned twice.");
    days.set(row.date, row);
  }

  const complete: DailySalesRow[] = [];
  for (const { period, scope } of periods) {
    const days = byPeriod.get(period) as Map<string, DailySalesRow>;
    for (const date of daysOf(scope)) {
      if (date > today) break;
      complete.push(days.get(date) ?? { period, date, revenue: 0, order_count: 0, item_count: 0 });
    }
  }
  return complete;
}
