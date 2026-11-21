import {
  type EntityCapabilityId,
  type RequestParameters,
  type Scope,
  TIME_SERIES_ROW_CAP,
} from "../capabilities/registry";
import {
  type DailySalesRequest,
  type DailySalesRow,
  completeDailySeries,
  seriesPeriods,
} from "./time-series";

/** One row of a capability's complete result, keyed by the registry's field names. */
export type ResultRowData = Record<string, string | number>;

/** Shown for a product without a brand; TheLook has a few (TASK-005 AC-2, THELOOK-PROFILE.md). */
export const UNKNOWN_BRAND = "Unknown brand";

/**
 * Retrieves a capability's complete result for a scope (TASK-003 AC-14). TASK-003 uses the fixture
 * implementation; TASK-004 adds BigQuery. Production code depends only on this interface.
 */
export abstract class DataSource {
  /** One row per customer or product; a time series uses `fetchTimeSeries`. */
  abstract fetch(capability: EntityCapabilityId, scope: Scope): Promise<ResultRowData[]>;

  /** Days with completed sales only, per requested period (TASK-005 AC-4). */
  abstract fetchDailySales(request: DailySalesRequest): Promise<DailySalesRow[]>;

  /**
   * A complete daily series for `sales_time_series`: the adapter's days plus the shared zero-fill
   * and today cut-off. An over-cap adapter result is returned unchanged, so the orchestrator refuses
   * it as in TASK-004.
   */
  async fetchTimeSeries(
    scope: Scope,
    parameters: RequestParameters,
    today: string,
  ): Promise<DailySalesRow[]> {
    const periods = seriesPeriods(scope, parameters);
    const rows = await this.fetchDailySales({
      periods,
      ...(parameters.product_filter ? { productFilter: parameters.product_filter } : {}),
    });
    return rows.length > TIME_SERIES_ROW_CAP ? rows : completeDailySeries(rows, periods, today);
  }
}
