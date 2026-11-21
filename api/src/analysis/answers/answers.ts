import {
  CAPABILITIES,
  type CapabilityId,
  type Filter,
  type GroupDimension,
  type Interval,
  type RequestParameters,
  type ResultShape,
  SALES_TIME_SERIES,
  type Scope,
  type ViewName,
  comparisonPeriod,
  getField,
} from "../capabilities/registry";
import type {
  AnalysisResult,
  GroupedView,
  SeriesView,
  ViewResult,
  ViewSettings,
} from "../engine/result-engine";

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

/** Time-series bucket labels (TASK-005 S6): "6 Jan 2025", "Week of 6 Jan 2025", "Jan 2025". */
export function formatBucketLabel(interval: Interval, bucketStart: string): string {
  const date = new Date(`${bucketStart}T00:00:00Z`);
  if (interval === "day") return formatDate(date);
  if (interval === "week") return `Week of ${formatDate(date)}`;
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
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

/** A time series' summary: per bucket, naming the lowest and highest (TASK-005 AC-7). */
function seriesSummaryAnswer(
  scope: Scope,
  parameters: RequestParameters,
  result: Extract<AnalysisResult, { operation: "summary" }>,
  buckets: NonNullable<Extract<AnalysisResult, { operation: "summary" }>["buckets"]>,
): string {
  const [one, many] = INTERVAL_NOUNS[buckets.interval];
  const filter = parameters.product_filter ? `, ${filterPhrase(parameters)}` : "";
  const base = `Based on all ${formatCount(result.baseCount)} ${result.baseCount === 1 ? one : many}, ${formatDateRange(scope)}${filter}`;
  if (result.baseCount === 0) return `${base}: there are no ${many} to analyse.`;
  const v = (x: number | null) => formatValue(SALES_TIME_SERIES, result.field, x ?? 0);
  return `${base}: ${fieldPhrase(SALES_TIME_SERIES, result.field)} totals ${v(result.total)}, average ${v(result.average)} per ${one}, median ${v(result.median)}, lowest ${v(result.min)} (${buckets.lowest}), highest ${v(result.max)} (${buckets.highest}).`;
}

/** `parameters` are a time series' filter and comparison, stated in its summary. */
export function analysisAnswer(
  capabilityId: CapabilityId,
  scope: Scope,
  result: AnalysisResult,
  parameters: RequestParameters = {},
): string {
  if (result.operation === "summary" && result.buckets)
    return seriesSummaryAnswer(scope, parameters, result, result.buckets);
  const base = basePhrase(capabilityId, scope, result);
  if (result.baseCount === 0) return `${base}: there are no ${nouns(capabilityId, 0)} to analyse.`;
  if (result.operation === "summary") {
    const v = (x: number | null) => formatValue(capabilityId, result.field, x ?? 0);
    return `${base}: ${fieldPhrase(capabilityId, result.field)} totals ${v(result.total)}, average ${v(result.average)}, median ${v(result.median)}, lowest ${v(result.min)}, highest ${v(result.max)}.`;
  }
  const v = (x: number) => formatValue(capabilityId, result.measure, x);
  const share = result.share === null ? "none" : formatPercent(result.share);
  return `${base}: the top ${formatCount(result.topRows)} ${nouns(capabilityId, result.topRows)} account for ${share} of ${fieldPhrase(capabilityId, result.measure)} (${v(result.topTotal)} of ${v(result.total)}).`;
}

const VIEW_LABELS: Record<ViewName, string> = {
  bar: "a bar chart",
  horizontal_bar: "a horizontal bar chart",
  line: "a line chart",
  pie: "a pie chart",
  table: "a table",
};

/** "a bar chart, a horizontal bar chart, or a table" */
function viewList(views: ViewName[]): string {
  const labels = views.map((v) => VIEW_LABELS[v]);
  return labels.length <= 2
    ? labels.join(" or ")
    : `${labels.slice(0, -1).join(", ")}, or ${labels.at(-1)}`;
}

/** Why a view does not suit a result shape (TASK-005 AC-9). */
export function viewUnsuitableReason(
  shape: ResultShape,
  view: ViewName,
  capabilityId: CapabilityId,
): string {
  if (shape === "series") return "sales over time is shown in date order.";
  if (view === "line") return "it shows change over time, and this result has no dates.";
  return `it shows parts of a whole, and this result lists individual ${nouns(capabilityId, 2)}.`;
}

/** The answer for a pie (S3): the slice rule and how many groups "Other" holds. */
export function pieAnswer(capabilityId: CapabilityId, grouped: GroupedView): string {
  const pie = grouped.pie;
  const [one, many] = GROUP_NOUNS[grouped.groupBy];
  const measure = pie ? fieldPhrase(capabilityId, pie.measure) : "";
  if (!pie || !pie.other) {
    const n = pie?.slices.length ?? 0;
    return `Showing the result as a pie chart of ${formatCount(n)} ${n === 1 ? one : many} by ${measure}.`;
  }
  const rest = pie.other.groups;
  return `Showing the result as a pie chart of the ${formatCount(pie.slices.length)} largest ${many} by ${measure}; the other ${formatCount(rest)} ${rest === 1 ? "is" : "are"} combined as "Other".`;
}

const GROUP_NOUNS: Record<GroupDimension, [string, string]> = {
  category: ["category", "categories"],
  department: ["department", "departments"],
  brand: ["brand", "brands"],
};

/**
 * The answer for a grouped product view (TASK-005 AC-8). Basic form; plan step 12 completes the
 * templates (AC-10).
 */
export function groupedAnswer(
  capabilityId: CapabilityId,
  scope: Scope,
  grouped: GroupedView,
  settings: ViewSettings,
): string {
  const [one, many] = GROUP_NOUNS[grouped.groupBy];
  const order = `by ${fieldPhrase(capabilityId, settings.sort.field)} (${settings.sort.direction === "desc" ? "highest" : "lowest"} first)`;
  const filters =
    settings.filters.length > 0
      ? `, ${nouns(capabilityId, 2)} with ${describeFilters(capabilityId, settings.filters)}`
      : "";
  const range = formatDateRange(scope);
  const shown = grouped.groups.length;
  if (!grouped.other)
    return `Showing ${formatCount(shown)} ${shown === 1 ? one : many} ${order}, ${range}${filters}.`;
  const rest = grouped.other.groups;
  return `Showing the top ${formatCount(shown)} of ${formatCount(grouped.groupCount)} ${many} ${order}, ${range}${filters}; ${formatCount(rest)} other ${rest === 1 ? `${one} is` : `${many} are`} combined as "Other".`;
}

interface ScopedCapability {
  capability: CapabilityId;
  scope: Scope;
  /** Time series only (TASK-005 AC-6). */
  parameters?: RequestParameters;
}

const filterPhrase = (p: RequestParameters | undefined) =>
  p?.product_filter ? `only ${p.product_filter.values.join(" or ")}` : "all products";

const comparisonRange = (scope: Scope, p: RequestParameters | undefined) =>
  p?.comparison ? formatDateRange(comparisonPeriod(scope, p.comparison)) : null;

function describeScoped({ capability, scope, parameters }: ScopedCapability): string {
  const base = `${CAPABILITIES[capability].title.toLowerCase()} for ${formatDateRange(scope)}`;
  if (capability !== SALES_TIME_SERIES || !parameters) return base;
  const compared = comparisonRange(scope, parameters);
  return (
    base +
    (parameters.product_filter ? `, ${filterPhrase(parameters)}` : "") +
    (compared ? `, compared with ${compared}` : "")
  );
}

/** What a different time-series request changes, e.g. "adds a comparison with …" (AC-6). */
function seriesChanges(current: ScopedCapability, next: ScopedCapability): string[] {
  const changes: string[] = [];
  const nextRange = formatDateRange(next.scope);
  if (nextRange !== formatDateRange(current.scope)) changes.push(`the period ${nextRange}`);
  if (filterPhrase(current.parameters) !== filterPhrase(next.parameters))
    changes.push(filterPhrase(next.parameters));
  const before = comparisonRange(current.scope, current.parameters);
  const after = comparisonRange(next.scope, next.parameters);
  if (before !== after)
    changes.push(
      after === null
        ? "no comparison"
        : before === null
          ? `adds a comparison with ${after}`
          : `a comparison with ${after} instead`,
    );
  return changes;
}

const SWITCH_ASK =
  "Would you like to explore anything further from your current dataset, or should I switch to the new dataset?";

/**
 * The dataset-switch question, in the requirements document's wording. Between two time series it
 * names what changes instead of repeating the whole description (TASK-005 AC-6).
 */
export function switchQuestion(current: ScopedCapability, next: ScopedCapability): string {
  const changes =
    current.capability === SALES_TIME_SERIES && next.capability === SALES_TIME_SERIES
      ? seriesChanges(current, next)
      : [];
  const needs = changes.length > 0 ? `new data: ${changes.join("; ")}` : describeScoped(next);
  return `Your current result covers ${describeScoped(current)}. This question needs ${needs}. ${SWITCH_ASK}`;
}

export const INTERVAL_NOUNS: Record<Interval, [string, string]> = {
  day: ["day", "days"],
  week: ["week", "weeks"],
  month: ["month", "months"],
};

/**
 * The answer for a loaded or re-viewed time series (TASK-005 AC-10): measure, interval, period,
 * filter, bucket count, and total; the partial buckets (S7); a note when days after `asOf` (the
 * retrieval date) are left out; with a comparison, its period and total and the change as "up" or
 * "down" by amount and percent. Descriptive only: no causal wording.
 */
export function seriesAnswer(
  scope: Scope,
  parameters: RequestParameters,
  series: SeriesView,
  asOf: string,
): string {
  const measure = series.measure;
  const value = (x: number) => formatValue(SALES_TIME_SERIES, measure, x);
  const [one, many] = INTERVAL_NOUNS[series.interval];
  const count = (n: number) => `${formatCount(n)} ${n === 1 ? one : many}`;
  const filter = parameters.product_filter ? `, ${filterPhrase(parameters)}` : "";
  const parts = [
    `Showing ${fieldPhrase(SALES_TIME_SERIES, measure)} by ${one}, ${formatDateRange(scope)}${filter}: ${count(series.main.length)}, total ${value(series.totals.main[measure])}.`,
  ];

  const partial = [
    ...new Set(
      [...series.main, ...(series.comparison ?? [])].filter((b) => b.partial).map((b) => b.label),
    ),
  ];
  if (partial.length > 0) parts.push(`Partial ${many}: ${partial.join(", ")}.`);
  if (lastDay(scope) > asOf)
    parts.push(
      `Days after ${formatDateRange({ start_date: asOf, end_date: nextDay(asOf) })} are not included yet.`,
    );

  const compared = comparisonRange(scope, parameters);
  const earlier = series.totals.comparison;
  const change = series.totals.change?.[measure];
  if (compared && earlier && change) {
    const amount = value(Math.abs(change.amount));
    const direction =
      change.amount === 0
        ? "no change"
        : `${change.amount > 0 ? "up" : "down"} ${amount} (${
            change.percent === null
              ? "no percentage, as the earlier total is zero"
              : formatPercent(Math.abs(change.percent))
          })`;
    parts.push(`Compared with ${compared}, total ${value(earlier[measure])}: ${direction}.`);
    if (series.lengthsDiffer && series.comparison)
      parts.push(
        `The periods differ in length (${formatCount(series.main.length)} and ${count(series.comparison.length)}), so the extra ${many} have no counterpart.`,
      );
  }
  return parts.join(" ");
}

const DAY_MS = 24 * 60 * 60 * 1000;
const nextDay = (iso: string) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
/** The last included day of a scope (its end date is exclusive). */
const lastDay = (scope: Scope) =>
  new Date(Date.parse(`${scope.end_date}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);

export const ANSWERS = {
  invalidDecision: "Sorry, I couldn't process that. Please rephrase.",
  keepCurrent: "Okay, staying with your current dataset.",
  noPendingSwitch: "There's no dataset switch waiting for confirmation.",
  noActiveResult: "There's no result yet. Ask a question to load data first.",
  displayedWhileGrouped:
    "While grouped, analyses run on the products, not on the groups shown. Ask about all products or the filtered products instead.",
  /** An unknown chart type, e.g. "scatter plot" (TASK-005 AC-9). */
  viewUnsupported: (requested: string, suitable: ViewName[]) => {
    const name = requested.trim().replace(/\s*\bchart$/i, "");
    return `${name.charAt(0).toUpperCase()}${name.slice(1)} charts aren't available. I can show it as ${viewList(suitable)}.`;
  },
  /** A known view that does not suit the result's shape; the current view stays. */
  viewUnsuitable: (view: ViewName, reason: string, suitable: ViewName[]) => {
    const label = VIEW_LABELS[view];
    return `${label.charAt(0).toUpperCase()}${label.slice(1)} doesn't suit this result: ${reason} I can show it as ${viewList(suitable)}.`;
  },
  viewChanged: (view: ViewName) => `Showing the result as ${VIEW_LABELS[view]}.`,
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
