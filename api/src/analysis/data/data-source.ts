import type { CapabilityId, Scope } from "../capabilities/registry";

/** One row of a capability's complete result, keyed by the registry's field names. */
export type ResultRowData = Record<string, string | number>;

/**
 * Retrieves a capability's complete result for a scope (TASK-003 AC-14). TASK-003 uses the fixture
 * implementation; TASK-004 adds BigQuery. Production code depends only on this interface.
 */
export abstract class DataSource {
  abstract fetch(capability: CapabilityId, scope: Scope): Promise<ResultRowData[]>;
}
