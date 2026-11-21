/** Browser client for the analysis API (TASK-003 AC-12). Same-origin; the session cookie is HttpOnly. */

export type FieldKind = "id" | "label" | "money" | "integer" | "category";
export type CellValue = string | number;
export type Row = Record<string, CellValue>;

export interface Scope {
  start_date: string;
  end_date: string;
}

export interface Filter {
  field: string;
  op: "gt" | "gte" | "lt" | "lte" | "between" | "in";
  value?: number;
  min?: number;
  max?: number;
  values?: string[];
}

export type ViewName = "bar" | "horizontal_bar" | "line" | "pie" | "table";
export type Interval = "day" | "week" | "month";
export type SeriesMeasure = "revenue" | "order_count" | "item_count";
export type GroupDimension = "category" | "department" | "brand";

export interface ViewSettings {
  filters: Filter[];
  sort: { field: string; direction: "asc" | "desc" };
  limit: number;
  view: ViewName;
  /** Time series only (TASK-005). */
  interval?: Interval;
  measure?: SeriesMeasure;
  /** A grouped product result (TASK-005 AC-8). */
  group_by?: GroupDimension;
  groupLimit?: number;
}

/** A time series' product filter and comparison (TASK-005 AC-3). */
export interface RequestParameters {
  product_filter?: { field: "category" | "department"; values: string[] };
  comparison?:
    | { baseline: "previous_period" | "previous_year" }
    | { baseline: "custom"; start_date: string; end_date: string };
}

export type SeriesTotals = Record<SeriesMeasure, number>;

export interface SeriesBucket extends SeriesTotals {
  label: string;
  firstDay: string;
  lastDay: string;
  partial: boolean;
}

/** Buckets of the main and comparison periods; bucket k pairs with bucket k (TASK-005 AC-5). */
export interface SeriesView {
  interval: Interval;
  measure: SeriesMeasure;
  main: SeriesBucket[];
  comparison?: SeriesBucket[];
  lengthsDiffer: boolean;
  totals: {
    main: SeriesTotals;
    comparison?: SeriesTotals;
    change?: Record<SeriesMeasure, { amount: number; percent: number | null }>;
  };
}

export type GroupRow = { key: string; product_count: number } & Record<string, CellValue>;
export type OtherRow = GroupRow & { key: "Other"; groups: number };

/** A grouped product result (TASK-005 AC-8, AC-9). */
export interface GroupedView {
  groupBy: GroupDimension;
  groupCount: number;
  rowCount: number;
  filteredCount: number;
  groups: GroupRow[];
  other: OtherRow | null;
  pie?: {
    measure: string;
    slices: (GroupRow & { share: number })[];
    other: (OtherRow & { share: number }) | null;
  };
}

export interface FieldInfo {
  name: string;
  label: string;
  kind: FieldKind;
}

export interface ActiveResult {
  capability: string;
  title: string;
  /** Singular and plural noun for one row, e.g. ["customer", "customers"]. */
  rowNoun: [string, string];
  scope: Scope;
  fields: FieldInfo[];
  rowCount: number;
  filteredCount: number;
  /** Entity rows; empty for a time series. */
  rows: Row[];
  view: ViewSettings;
  parameters?: RequestParameters;
  series?: SeriesView;
  comparisonScope?: Scope;
  grouped?: GroupedView;
}

interface CardBase {
  target: "complete" | "filtered" | "displayed";
  baseCount: number;
  rowNoun: [string, string];
  fields: FieldInfo[];
}

export type AnalysisCard =
  | (CardBase & {
      operation: "summary";
      field: string;
      count: number;
      total: number;
      average: number | null;
      median: number | null;
      min: number | null;
      max: number | null;
      /** A time series' summary: its bucket size and the lowest and highest buckets. */
      buckets?: { interval: Interval; lowest: string | null; highest: string | null };
    })
  | (CardBase & {
      operation: "concentration";
      measure: string;
      topRows: number;
      topTotal: number;
      total: number;
      share: number | null;
    });

export interface ChatMessage {
  seq: number;
  role: "user" | "assistant";
  text: string;
  card?: AnalysisCard;
}

export type PendingAction =
  | { type: "switch"; capability: string; scope: Scope; parameters?: RequestParameters }
  | { type: "clarification"; question: string };

export interface AnalysisState {
  messages: ChatMessage[];
  activeResult: ActiveResult | null;
  pending: PendingAction | null;
  /** Backend-written notice, e.g. the message limit; shown above the input. */
  notice: string | null;
  /** A turn is still being answered, e.g. after a refresh mid-turn (TASK-004 AC-2). */
  turnInProgress: boolean;
}

/**
 * `turn-in-progress`: HTTP 409, another turn for this session is still running (TASK-004 AC-1).
 * `turn-dropped`: HTTP 409 `turn_superseded`, this turn took too long and was discarded (review S4).
 */
export type ApiError =
  "signed-out" | "turn-in-progress" | "turn-dropped" | "network" | "unexpected";
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

async function call<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: "same-origin",
      ...(body === undefined
        ? {}
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
    });
  } catch {
    return { ok: false, error: "network" };
  }
  if (response.status === 401) return { ok: false, error: "signed-out" };
  if (response.status === 409) {
    const body = (await response.json().catch(() => null)) as { code?: string } | null;
    return {
      ok: false,
      error: body?.code === "turn_superseded" ? "turn-dropped" : "turn-in-progress",
    };
  }
  if (!response.ok) return { ok: false, error: "unexpected" };
  return { ok: true, data: (await response.json()) as T };
}

export const getAnalysisState = () =>
  call<AnalysisState & { demoExamples: string[] | null }>("/api/analysis/state");

export const sendMessage = (text: string) =>
  call<{ reply: { text: string }; state: AnalysisState }>("/api/analysis/messages", { text });

export const chooseSwitch = (choice: "switch" | "keep") =>
  call<{ reply: { text: string }; state: AnalysisState }>("/api/analysis/switch", { choice });
