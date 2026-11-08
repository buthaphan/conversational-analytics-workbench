import {
  CAPABILITIES,
  type CapabilityId,
  type Filter,
  type Scope,
  getField,
} from "../capabilities/registry";
import type { AnalysisResult, ViewResult, ViewSettings } from "../engine/result-engine";

/**
 * Backend-written answers (TASK-003 AC-10, TD-10). Every figure the user sees comes from here,
 * computed by the result engine; the model never supplies numbers.
 */

const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const COUNT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const formatMoney = (value: number) => MONEY.format(value);
export const formatCount = (value: number) => COUNT.format(value);
export const formatPercent = (share: number) => `${(share * 100).toFixed(1)}%`;

function formatDate(date: Date): string {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** "1 Jan 2025 – 31 Dec 2025"; the exclusive end date is shown as the last included day. */
export function formatDateRange(scope: Scope): string {
  const start = new Date(`${scope.start_date}T00:00:00Z`);
  const last = new Date(new Date(`${scope.end_date}T00:00:00Z`).getTime() - 24 * 60 * 60 * 1000);
  return last.getTime() === start.getTime()
    ? formatDate(start)
    : `${formatDate(start)} – ${formatDate(last)}`;
}

function formatValue(capabilityId: CapabilityId, fieldName: string, value: number): string {
  const field = getField(CAPABILITIES[capabilityId], fieldName);
  return field?.kind === "money" ? formatMoney(value) : formatCount(value);
}

const fieldPhrase = (capabilityId: CapabilityId, name: string) =>
  (getField(CAPABILITIES[capabilityId], name)?.label ?? name).toLowerCase();

const nouns = (capabilityId: CapabilityId, count: number) => {
  const [one, many] = CAPABILITIES[capabilityId].rowNoun;
  return count === 1 ? one : many;
};

export function describeFilters(capabilityId: CapabilityId, filters: Filter[]): string {
  return filters
    .map((f) => {
      const name = fieldPhrase(capabilityId, f.field);
      const v = (x: number | undefined) => formatValue(capabilityId, f.field, x ?? 0);
      switch (f.op) {
        case "gt":
          return `${name} over ${v(f.value)}`;
        case "gte":
          return `${name} of at least ${v(f.value)}`;
        case "lt":
          return `${name} under ${v(f.value)}`;
        case "lte":
          return `${name} of at most ${v(f.value)}`;
        case "between":
          return `${name} between ${v(f.min)} and ${v(f.max)}`;
        case "in":
          return `${name} ${(f.values ?? []).join(" or ")}`;
      }
    })
    .join(", ");
}

export function viewAnswer(
  capabilityId: CapabilityId,
  scope: Scope,
  view: ViewResult,
  settings: ViewSettings,
): string {
  const shown = view.rows.length;
  const order = `by ${fieldPhrase(capabilityId, settings.sort.field)} (${settings.sort.direction === "desc" ? "highest" : "lowest"} first)`;
  const range = formatDateRange(scope);
  if (settings.filters.length === 0) {
    return `Showing ${formatCount(shown)} of ${formatCount(view.rowCount)} ${nouns(capabilityId, view.rowCount)}, ${range}, ${order}.`;
  }
  return `Showing ${formatCount(shown)} of ${formatCount(view.filteredCount)} ${nouns(capabilityId, view.filteredCount)} with ${describeFilters(capabilityId, settings.filters)} (${formatCount(view.rowCount)} in the result), ${range}, ${order}.`;
}

function basePhrase(capabilityId: CapabilityId, scope: Scope, result: AnalysisResult): string {
  const n = formatCount(result.baseCount);
  const noun = nouns(capabilityId, result.baseCount);
  if (result.target === "complete") return `Based on all ${n} ${noun}, ${formatDateRange(scope)}`;
  return `Based on the ${n} ${result.target} ${noun}`;
}

export function analysisAnswer(
  capabilityId: CapabilityId,
  scope: Scope,
  result: AnalysisResult,
): string {
  const base = basePhrase(capabilityId, scope, result);
  if (result.baseCount === 0) return `${base}: there are no ${nouns(capabilityId, 0)} to analyse.`;
  if (result.operation === "summary") {
    const v = (x: number | null) => formatValue(capabilityId, result.field, x ?? 0);
    return `${base}: ${fieldPhrase(capabilityId, result.field)} totals ${v(result.total)}, average ${v(result.average)}, median ${v(result.median)}, lowest ${v(result.min)}, highest ${v(result.max)}.`;
  }
  if (result.operation === "concentration") {
    const v = (x: number) => formatValue(capabilityId, result.measure, x);
    const share = result.share === null ? "none" : formatPercent(result.share);
    return `${base}: the top ${formatCount(result.topRows)} ${nouns(capabilityId, result.topRows)} account for ${share} of ${fieldPhrase(capabilityId, result.measure)} (${v(result.topTotal)} of ${v(result.total)}).`;
  }
  const capability = CAPABILITIES[capabilityId];
  const measure = capability.fields.find((f) => f.kind === "money")?.name ?? "";
  const groups = result.groups
    .map(
      (g) =>
        `${g.key} ${formatValue(capabilityId, measure, Number(g[measure]))} (${formatCount(g.rows)} ${nouns(capabilityId, g.rows)})`,
    )
    .join(", ");
  return `${base}: ${fieldPhrase(capabilityId, measure)} by ${fieldPhrase(capabilityId, result.groupBy)}: ${groups}.`;
}

interface ScopedCapability {
  capability: CapabilityId;
  scope: Scope;
}

const describeScoped = ({ capability, scope }: ScopedCapability) =>
  `${CAPABILITIES[capability].title.toLowerCase()} for ${formatDateRange(scope)}`;

/** The dataset-switch question, in the requirements document's wording. */
export function switchQuestion(current: ScopedCapability, next: ScopedCapability): string {
  return `Your current result covers ${describeScoped(current)}. This question needs ${describeScoped(next)}. Would you like to explore anything further from your current dataset, or should I switch to the new dataset?`;
}

export const ANSWERS = {
  invalidDecision: "Sorry, I couldn't process that. Please rephrase.",
  keepCurrent: "Okay, staying with your current dataset.",
  noPendingSwitch: "There's no dataset switch waiting for confirmation.",
  noActiveResult: "There's no result yet. Ask a question to load data first.",
  viewUnsupported: (view: string) =>
    `${view.charAt(0).toUpperCase()}${view.slice(1)} charts aren't available yet. I can show this as a bar chart or a table.`,
  viewChanged: (view: "bar" | "table") =>
    view === "bar" ? "Showing the result as a bar chart." : "Showing the result as a table.",
  rowCap: (capabilityId: CapabilityId, rows: number, cap: number) =>
    `This scope returns ${formatCount(rows)} ${nouns(capabilityId, rows)}, more than the limit of ${formatCount(cap)}. Please choose a narrower date range.`,
  messageLimit:
    "This conversation has reached its message limit. Sign out and in again to start a fresh analysis.",
  turnInProgress: "I'm still answering your last message. Please wait a moment.",
  turnDropped: "Your last message wasn't answered. Please send it again.",
  retrievalFailed:
    "Sorry, the data could not be loaded. Your current result is unchanged. Please try again.",
  demoUnknown: (examples: string[]) =>
    `Demo mode: try one of these examples: ${examples.map((e) => `"${e}"`).join(", ")}.`,
} as const;
