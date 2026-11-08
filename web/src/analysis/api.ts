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

export interface ViewSettings {
  filters: Filter[];
  sort: { field: string; direction: "asc" | "desc" };
  limit: number;
  view: "bar" | "table";
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
  rows: Row[];
  view: ViewSettings;
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
    })
  | (CardBase & {
      operation: "concentration";
      measure: string;
      topRows: number;
      topTotal: number;
      total: number;
      share: number | null;
    })
  | (CardBase & {
      operation: "group";
      groupBy: string;
      groups: ({ key: string; rows: number } & Record<string, CellValue>)[];
    });

export interface ChatMessage {
  seq: number;
  role: "user" | "assistant";
  text: string;
  card?: AnalysisCard;
}

export type PendingAction =
  | { type: "switch"; capability: string; scope: Scope }
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

/** `turn-in-progress`: HTTP 409, another turn for this session is still running (TASK-004 AC-1). */
export type ApiError = "signed-out" | "turn-in-progress" | "network" | "unexpected";
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
  if (response.status === 409) return { ok: false, error: "turn-in-progress" };
  if (!response.ok) return { ok: false, error: "unexpected" };
  return { ok: true, data: (await response.json()) as T };
}

export const getAnalysisState = () =>
  call<AnalysisState & { demoExamples: string[] | null }>("/api/analysis/state");

export const sendMessage = (text: string) =>
  call<{ reply: { text: string }; state: AnalysisState }>("/api/analysis/messages", { text });

export const chooseSwitch = (choice: "switch" | "keep") =>
  call<{ reply: { text: string }; state: AnalysisState }>("/api/analysis/switch", { choice });
