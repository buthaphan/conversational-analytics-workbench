/**
 * Backend-owned capability registry (TASK-003 AC-2). The AI may only name these capabilities and
 * fields; every value is validated here before any data operation. Semantics follow
 * docs/product/AI-DATA-CAPABILITIES.md.
 */

/** Capabilities whose result is one row per entity (customer, product). */
export type EntityCapabilityId = "customer_spending" | "product_sales_performance";
/** One row per day and period, shown as buckets over time (TASK-005 AC-4). */
export const SALES_TIME_SERIES = "sales_time_series";
export type CapabilityId = EntityCapabilityId | typeof SALES_TIME_SERIES;
export type FieldKind = "id" | "label" | "money" | "integer" | "category";
export type AnalysisTarget = "complete" | "filtered" | "displayed";

export interface FieldDef {
  name: string;
  kind: FieldKind;
  /** Short heading for tables and templates. */
  label: string;
  /** Meaning and unit, sent to the model (AC-5). */
  description: string;
  /**
   * False for a category field with too many values to list (brand): the model gets only their
   * number, and a refused filter does not list the options (TASK-005 AC-2). The backend still
   * validates against every stored value.
   */
  listValues?: false;
}

export interface CapabilityDef {
  id: CapabilityId;
  title: string;
  description: string;
  whenToUse: string;
  clarifyWhen: string;
  /** Singular/plural noun for one row, used in templates. */
  rowNoun: [string, string];
  fields: FieldDef[];
  idField: string;
  labelField: string;
  defaultSort: { field: string; direction: "asc" | "desc" };
  concentrationMeasures: string[];
  groupByFields: string[];
  /** Largest complete result that may be stored; larger retrievals are refused (AC-11). */
  rowCap: number;
}

export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 100;
const MAX_SCOPE_YEARS = 5;
/**
 * Row caps from the TheLook profile (TASK-004 AC-8, docs/product/THELOOK-PROFILE.md): the largest
 * scope (5 years) had about 25,700 customers and 22,100 products; there are 29,120 products in all.
 * Set only here (review N2): `validateAnalysis` bounds `top_count` by these values.
 */
const CUSTOMER_ROW_CAP = 50_000;
const PRODUCT_ROW_CAP = 50_000;
/**
 * Daily rows of both periods at the 5-year maximum (2 × 1,827), with headroom; confirmed by the
 * profile (TASK-005 AC-1, AC-4). BigQuery's over-cap guard asks for one row more.
 */
export const TIME_SERIES_ROW_CAP = 4_000;

export const CAPABILITIES: Record<CapabilityId, CapabilityDef> = {
  customer_spending: {
    id: "customer_spending",
    title: "Customer spending",
    description:
      "Compares customers by the monetary value of completed purchases in a date range: one row per customer with total spend, completed-order count, and average spend per completed order.",
    whenToUse:
      "Who spent the most or least, who spent over or under an amount, highest average order value. Not for purchase frequency or recency alone, or for line items of a specific order.",
    clarifyWhen:
      "What 'best customer' means; whether 'last year' means the previous calendar year or the trailing 12 months.",
    rowNoun: ["customer", "customers"],
    fields: [
      {
        name: "customer_id",
        kind: "id",
        label: "Customer ID",
        description: "Customer identifier.",
      },
      {
        name: "customer_name",
        kind: "label",
        label: "Customer",
        description: "Customer display name (synthetic).",
      },
      {
        name: "total_spend",
        kind: "money",
        label: "Total spend",
        description: "Sum of sale prices of completed order items in the scope, in USD.",
      },
      {
        name: "order_count",
        kind: "integer",
        label: "Orders",
        description: "Number of distinct orders with at least one completed item in the scope.",
      },
      {
        name: "avg_order_value",
        kind: "money",
        label: "Avg order value",
        description: "Total spend divided by order count, in USD.",
      },
    ],
    idField: "customer_id",
    labelField: "customer_name",
    defaultSort: { field: "total_spend", direction: "desc" },
    concentrationMeasures: ["total_spend", "order_count"],
    groupByFields: [],
    rowCap: CUSTOMER_ROW_CAP,
  },
  product_sales_performance: {
    id: "product_sales_performance",
    title: "Product sales performance",
    description:
      "Compares individual products by sales results in a date range: one row per product with its category, department, brand, revenue, and number of completed items sold. The result can also be shown grouped by category, department, or brand.",
    whenToUse:
      'Which products earned the most revenue or sold the most units, lowest-selling products, products within a category. Also category-, department-, or brand-level totals for one period, through grouping: "Which category performed best?" is this capability grouped by category. Not for sales over time.',
    clarifyWhen:
      "Whether 'top-selling' means revenue or units when the conversation does not settle it.",
    rowNoun: ["product", "products"],
    fields: [
      { name: "product_id", kind: "id", label: "Product ID", description: "Product identifier." },
      { name: "product_name", kind: "label", label: "Product", description: "Product name." },
      { name: "category", kind: "category", label: "Category", description: "Product category." },
      {
        name: "department",
        kind: "category",
        label: "Department",
        description: "Product department (Men or Women).",
      },
      {
        name: "brand",
        kind: "category",
        label: "Brand",
        description: `Product brand; "Unknown brand" when the product has none.`,
        listValues: false,
      },
      {
        name: "revenue",
        kind: "money",
        label: "Revenue",
        description: "Sum of sale prices of completed items in the scope, in USD.",
      },
      {
        name: "item_count",
        kind: "integer",
        label: "Items sold",
        description: "Number of completed items (one per order line) in the scope.",
      },
    ],
    idField: "product_id",
    labelField: "product_name",
    defaultSort: { field: "revenue", direction: "desc" },
    concentrationMeasures: ["revenue", "item_count"],
    groupByFields: ["category", "department", "brand"],
    rowCap: PRODUCT_ROW_CAP,
  },
  sales_time_series: {
    id: SALES_TIME_SERIES,
    title: "Sales over time",
    description:
      "Total completed sales per day, week, or month in a date range: revenue, completed orders, and items sold. Optionally for some categories or one department, and compared with a second period.",
    whenToUse:
      "How sales moved over time: daily, weekly, or monthly revenue, orders, or items; sales over time for some categories or one department; comparing a period with the previous period, the same period a year earlier, or other given dates. Not for ranking products or customers, not for brand-level trends, and not for forecasts.",
    clarifyWhen:
      "Which period to compare with when the user asks to compare with 'before' or 'earlier' without saying which; whether a product word means a category or a department.",
    rowNoun: ["day", "days"],
    fields: [
      { name: "date", kind: "label", label: "Date", description: "UTC day, YYYY-MM-DD." },
      {
        name: "revenue",
        kind: "money",
        label: "Revenue",
        description: "Sum of sale prices of completed items, in USD.",
      },
      {
        name: "order_count",
        kind: "integer",
        label: "Orders",
        description: "Number of distinct orders with at least one completed item.",
      },
      {
        name: "item_count",
        kind: "integer",
        label: "Items sold",
        description: "Number of completed items (one per order line).",
      },
    ],
    idField: "date",
    labelField: "date",
    // Not used for display: a series is always in date order (AC-7).
    defaultSort: { field: "revenue", direction: "desc" },
    concentrationMeasures: [],
    groupByFields: [],
    rowCap: TIME_SERIES_ROW_CAP,
  },
};

export function getCapability(id: string): CapabilityDef | undefined {
  return Object.hasOwn(CAPABILITIES, id) ? CAPABILITIES[id as CapabilityId] : undefined;
}

export function getField(capability: CapabilityDef, name: string): FieldDef | undefined {
  return capability.fields.find((f) => f.name === name);
}

export const isNumeric = (field: FieldDef) => field.kind === "money" || field.kind === "integer";

// ---- Validation -------------------------------------------------------------------------------

export type IssueCode =
  "unknown_field" | "invalid_operator" | "invalid_value" | "missing_value" | "value_not_allowed";

/** Why a request cannot be applied; the orchestrator turns it into a clarification (AC-6 b). */
export interface Issue {
  code: IssueCode;
  field?: string;
  message: string;
  validOptions?: string[];
}

export type Validated<T> = ({ ok: true } & T) | { ok: false; issue: Issue };

export interface Scope {
  start_date: string;
  end_date: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

export function validateScope(
  scope: Partial<Record<string, unknown>> | undefined,
): Validated<{ scope: Scope }> {
  if (!scope?.start_date || !scope?.end_date) {
    return {
      ok: false,
      issue: { code: "missing_value", field: "scope", message: "A start and end date are needed." },
    };
  }
  const start = parseDate(scope.start_date);
  const end = parseDate(scope.end_date);
  if (!start || !end) {
    return {
      ok: false,
      issue: {
        code: "invalid_value",
        field: "scope",
        message: "Dates must be valid YYYY-MM-DD dates.",
      },
    };
  }
  if (end <= start) {
    return {
      ok: false,
      issue: {
        code: "invalid_value",
        field: "scope",
        message: "The end date must be after the start date.",
      },
    };
  }
  const limit = new Date(start);
  limit.setUTCFullYear(limit.getUTCFullYear() + MAX_SCOPE_YEARS);
  if (end > limit) {
    return {
      ok: false,
      issue: {
        code: "invalid_value",
        field: "scope",
        message: `The date range can be at most ${MAX_SCOPE_YEARS} years.`,
      },
    };
  }
  return {
    ok: true,
    scope: { start_date: scope.start_date as string, end_date: scope.end_date as string },
  };
}

export type FilterOp = "gt" | "gte" | "lt" | "lte" | "between" | "in";

export interface Filter {
  field: string;
  op: FilterOp;
  value?: number;
  min?: number;
  max?: number;
  values?: string[];
}

export interface Refinement {
  filters?: Filter[];
  sort?: { field: string; direction: "asc" | "desc" };
  limit?: number;
  clear_filters?: boolean;
  /** TASK-005 view settings (DEC-002, AC-8). */
  group_by?: GroupDimension | "none";
  interval?: Interval;
  measure?: string;
}

export type GroupDimension = "category" | "department" | "brand";
/** Brands shown when grouped by brand, unless the user asks for 1–30 (S10, AC-8). */
export const DEFAULT_BRAND_GROUPS = 20;
export const MAX_BRAND_GROUPS = 30;

/** The current view's settings that a refinement is checked against. */
export interface ViewContext {
  /** A time series' interval; refusals name its bucket ("month"). */
  interval?: Interval;
  /** The current grouping of a product result. */
  group_by?: GroupDimension;
}

/** Allowed values per categorical field, taken from the active result. */
export type AllowedValues = Record<string, string[]>;

const fail = (issue: Issue): { ok: false; issue: Issue } => ({ ok: false, issue });

function validateFilter(
  capability: CapabilityDef,
  filter: Filter,
  allowed: AllowedValues,
): Issue | null {
  const field = getField(capability, filter.field);
  if (!field) {
    return {
      code: "unknown_field",
      field: filter.field,
      message: `This result has no field "${filter.field}".`,
    };
  }
  if (field.kind === "category") {
    const listed = field.listValues !== false;
    if (filter.op !== "in")
      return {
        code: "invalid_operator",
        field: field.name,
        message: `${field.label} can only be filtered by value.`,
      };
    if (!filter.values?.length)
      return {
        code: "missing_value",
        field: field.name,
        message: `Which ${field.label.toLowerCase()}?`,
        ...(listed ? { validOptions: allowed[field.name] } : {}),
      };
    const options = allowed[field.name] ?? [];
    const unknown = filter.values.filter((v) => !options.includes(v));
    if (unknown.length > 0) {
      return listed
        ? {
            code: "value_not_allowed",
            field: field.name,
            message: `Choose from the available ${field.label.toLowerCase()} values.`,
            validOptions: options,
          }
        : {
            code: "value_not_allowed",
            field: field.name,
            message: `This result has no ${field.label.toLowerCase()} named ${unknown.map((v) => `"${v}"`).join(" or ")}. Names must match exactly.`,
          };
    }
    return null;
  }
  if (!isNumeric(field) || filter.op === "in") {
    return {
      code: "invalid_operator",
      field: field.name,
      message: `${field.label} cannot be filtered that way.`,
    };
  }
  if (filter.op === "between") {
    if (filter.min === undefined || filter.max === undefined) {
      return {
        code: "missing_value",
        field: field.name,
        message: `A lower and upper ${field.label.toLowerCase()} are needed.`,
      };
    }
    if (!Number.isFinite(filter.min) || !Number.isFinite(filter.max) || filter.min > filter.max) {
      return {
        code: "invalid_value",
        field: field.name,
        message: "The lower bound must not exceed the upper bound.",
      };
    }
    return null;
  }
  if (filter.value === undefined) {
    return {
      code: "missing_value",
      field: field.name,
      message: `What ${field.label.toLowerCase()} threshold?`,
    };
  }
  if (!Number.isFinite(filter.value)) {
    return { code: "invalid_value", field: field.name, message: "The threshold must be a number." };
  }
  return null;
}

/** `current` is the view the refinement applies to (a series' interval, a product grouping). */
export function validateRefinement(
  capabilityId: CapabilityId,
  refinement: Refinement,
  allowed: AllowedValues,
  current: ViewContext = {},
): Validated<{ refinement: Refinement }> {
  const capability = CAPABILITIES[capabilityId];
  if (capabilityId === SALES_TIME_SERIES) {
    const interval = refinement.interval ?? current.interval ?? "month";
    const issue = seriesRefinementIssue(refinement, interval);
    if (issue) return fail(issue);
  } else {
    const issue =
      timeSeriesOnly(refinement, capability) ?? groupingIssue(capability, refinement, current);
    if (issue) return fail(issue);
  }
  for (const filter of refinement.filters ?? []) {
    const issue = validateFilter(capability, filter, allowed);
    if (issue) return fail(issue);
  }
  if (refinement.sort) {
    const field = getField(capability, refinement.sort.field);
    if (!field)
      return fail({
        code: "unknown_field",
        field: refinement.sort.field,
        message: `This result has no field "${refinement.sort.field}".`,
      });
    if (!isNumeric(field))
      return fail({
        code: "invalid_operator",
        field: field.name,
        message: `Results can be sorted by a measure, not by ${field.label.toLowerCase()}.`,
      });
  }
  const grouped = refinement.group_by
    ? refinement.group_by !== "none"
    : current.group_by !== undefined;
  if (
    !grouped &&
    refinement.limit !== undefined &&
    (!Number.isInteger(refinement.limit) || refinement.limit < 1 || refinement.limit > MAX_LIMIT)
  ) {
    return fail({
      code: "invalid_value",
      field: "limit",
      message: `Show between 1 and ${MAX_LIMIT} rows.`,
    });
  }
  return { ok: true, refinement };
}

/** Grouping is a view (`Refinement.group_by`), not an analysis (TASK-005 AC-8). */
export interface Analysis {
  operation: "summary" | "concentration";
  field?: string;
  measure?: string;
  top_count?: number;
  top_percent?: number;
  target: AnalysisTarget;
}

export function validateAnalysis(
  capabilityId: CapabilityId,
  analysis: Analysis,
): Validated<{ analysis: Analysis }> {
  const capability = CAPABILITIES[capabilityId];
  if (capabilityId === SALES_TIME_SERIES && analysis.operation === "concentration")
    return fail({ code: "invalid_operator", field: "operation", message: SERIES_NO_CONCENTRATION });
  const numericFieldIssue = (name: string | undefined, allowedNames?: string[]): Issue | null => {
    if (!name)
      return {
        code: "missing_value",
        message: "Which measure?",
        validOptions: allowedNames ?? capability.fields.filter(isNumeric).map((f) => f.name),
      };
    const field = getField(capability, name);
    if (!field)
      return { code: "unknown_field", field: name, message: `This result has no field "${name}".` };
    if (!isNumeric(field) || (allowedNames && !allowedNames.includes(name))) {
      return {
        code: "invalid_operator",
        field: name,
        message: `${field.label} cannot be analysed that way.`,
        validOptions: allowedNames,
      };
    }
    return null;
  };

  if (analysis.operation === "summary") {
    const issue = numericFieldIssue(analysis.field);
    return issue ? fail(issue) : { ok: true, analysis };
  }
  const issue = numericFieldIssue(analysis.measure, capability.concentrationMeasures);
  if (issue) return fail(issue);
  const { top_count, top_percent } = analysis;
  if (top_percent !== undefined && !(top_percent > 0 && top_percent <= 100)) {
    return fail({
      code: "invalid_value",
      field: "top_percent",
      message: "The share must be between 0 and 100 percent.",
    });
  }
  // Bounded by the row cap: no stored result is larger, and an unbounded number would overflow
  // the SQL cast (review R3).
  if (
    top_count !== undefined &&
    !(Number.isInteger(top_count) && top_count >= 1 && top_count <= capability.rowCap)
  ) {
    return fail({
      code: "invalid_value",
      field: "top_count",
      message: `The top count must be a whole number from 1 to ${capability.rowCap.toLocaleString("en-US")}.`,
    });
  }
  return { ok: true, analysis };
}

// ---- Views (TASK-005 AC-9) ---------------------------------------------------------------------

export const VIEWS = ["bar", "horizontal_bar", "line", "pie", "table"] as const;
export type ViewName = (typeof VIEWS)[number];
/** Entity rows, a grouped product result, or a time series. */
export type ResultShape = "rows" | "groups" | "series";

/** Which views suit each result shape, in the order they are offered. */
export const VIEWS_BY_SHAPE: Record<ResultShape, ViewName[]> = {
  rows: ["bar", "horizontal_bar", "table"],
  groups: ["bar", "horizontal_bar", "pie", "table"],
  series: ["line", "bar", "table"],
};
export const DEFAULT_VIEW: Record<ResultShape, ViewName> = {
  rows: "bar",
  groups: "bar",
  series: "line",
};
/** A pie shows at most this many slices: the 5 largest plus "Other" (S3). */
export const MAX_PIE_SLICES = 6;

const VIEW_SYNONYMS: Record<string, ViewName> = {
  bar: "bar",
  bars: "bar",
  column: "bar",
  columns: "bar",
  "vertical bar": "bar",
  "vertical bars": "bar",
  "horizontal bar": "horizontal_bar",
  "horizontal bars": "horizontal_bar",
  horizontal: "horizontal_bar",
  line: "line",
  lines: "line",
  pie: "pie",
  table: "table",
};

/** "Horizontal bar chart", "horizontal-bars", "pie chart" → a view name; null when unknown. */
export function normalizeViewName(text: string): ViewName | null {
  const name = text
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ")
    .replace(/\s*\b(chart|graph|plot|view)$/, "")
    .trim();
  return Object.hasOwn(VIEW_SYNONYMS, name) ? (VIEW_SYNONYMS[name] as ViewName) : null;
}

// ---- Time series (TASK-005 AC-3, AC-4, DEC-002) ----------------------------------------------

export type Interval = "day" | "week" | "month";
export const TIME_SERIES_MEASURES = ["revenue", "order_count", "item_count"] as const;
export type TimeSeriesMeasure = (typeof TIME_SERIES_MEASURES)[number];
/** Daily buckets are offered for periods up to this many days. */
const MAX_DAY_BUCKETS = 366;

/** TheLook's categories and departments (docs/product/THELOOK-PROFILE.md, profiled 2026-11-15). */
export const THELOOK_CATEGORIES = [
  "Accessories",
  "Active",
  "Blazers & Jackets",
  "Clothing Sets",
  "Dresses",
  "Fashion Hoodies & Sweatshirts",
  "Intimates",
  "Jeans",
  "Jumpsuits & Rompers",
  "Leggings",
  "Maternity",
  "Outerwear & Coats",
  "Pants",
  "Pants & Capris",
  "Plus",
  "Shorts",
  "Skirts",
  "Sleep & Lounge",
  "Socks",
  "Socks & Hosiery",
  "Suits",
  "Suits & Sport Coats",
  "Sweaters",
  "Swim",
  "Tops & Tees",
  "Underwear",
];
export const DEPARTMENTS = ["Men", "Women"];

export interface ProductFilter {
  field: "category" | "department";
  values: string[];
}
export type Comparison =
  | { baseline: "previous_period" }
  | { baseline: "previous_year" }
  | { baseline: "custom"; start_date: string; end_date: string };
/** What changes the retrieval of a time series (DEC-002); interval and measure are view settings. */
export interface RequestParameters {
  product_filter?: ProductFilter;
  comparison?: Comparison;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toIso = (date: Date) => date.toISOString().slice(0, 10);

export function periodDays(scope: Scope): number {
  return Math.round(
    (toDate(scope.end_date).getTime() - toDate(scope.start_date).getTime()) / DAY_MS,
  );
}

/** Days up to 31 days, weeks up to 92 days, otherwise months (AC-3). */
export function defaultInterval(scope: Scope): Interval {
  const days = periodDays(scope);
  return days <= 31 ? "day" : days <= 92 ? "week" : "month";
}

/**
 * A series' default interval, from the longer of its periods, so a long comparison never defaults
 * to daily buckets it cannot have (task review SF-1).
 */
export function seriesDefaultInterval(scope: Scope, parameters: RequestParameters): Interval {
  const comparison = parameters.comparison ? comparisonPeriod(scope, parameters.comparison) : null;
  return defaultInterval(
    comparison && periodDays(comparison) > periodDays(scope) ? comparison : scope,
  );
}

/** One year earlier; 29 February becomes 28 February (S8). */
function yearBefore(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const day = m === 2 && d === 29 ? 28 : d;
  return `${y - 1}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Shifts a first-of-month date back by whole months. */
function monthsBefore(iso: string, months: number): string {
  const date = toDate(iso);
  date.setUTCMonth(date.getUTCMonth() - months);
  return toIso(date);
}

/**
 * The comparison period (AC-4, S8): the previous period is the same number of calendar months
 * immediately before when the period is whole months, otherwise the same number of days; the
 * previous year shifts both dates back one year.
 */
export function comparisonPeriod(scope: Scope, comparison: Comparison): Scope {
  if (comparison.baseline === "custom")
    return { start_date: comparison.start_date, end_date: comparison.end_date };
  if (comparison.baseline === "previous_year") {
    // Shift the last included day, not the exclusive end: an exclusive end of 29 Feb means the
    // period ends on 28 Feb, so the year before also ends on 28 Feb (task review S-1).
    const lastDay = toIso(new Date(toDate(scope.end_date).getTime() - DAY_MS));
    const end = toIso(new Date(toDate(yearBefore(lastDay)).getTime() + DAY_MS));
    return { start_date: yearBefore(scope.start_date), end_date: end };
  }
  const start = toDate(scope.start_date);
  const end = toDate(scope.end_date);
  if (start.getUTCDate() === 1 && end.getUTCDate() === 1) {
    const months =
      (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      end.getUTCMonth() -
      start.getUTCMonth();
    return { start_date: monthsBefore(scope.start_date, months), end_date: scope.start_date };
  }
  return {
    start_date: toIso(new Date(start.getTime() - periodDays(scope) * DAY_MS)),
    end_date: scope.start_date,
  };
}

/**
 * Whether two sets of parameters retrieve the same data for a scope (AC-6): the same filter field
 * and values in any order, and the same comparison period however it was expressed.
 */
export function sameParameters(scope: Scope, a: RequestParameters, b: RequestParameters): boolean {
  const filterKey = (p: RequestParameters) =>
    p.product_filter
      ? `${p.product_filter.field}:${[...new Set(p.product_filter.values)].sort().join("\u0000")}`
      : "";
  const periodKey = (p: RequestParameters) => {
    if (!p.comparison) return "";
    const period = comparisonPeriod(scope, p.comparison);
    return `${period.start_date}/${period.end_date}`;
  };
  return filterKey(a) === filterKey(b) && periodKey(a) === periodKey(b);
}

const TIME_SERIES_ONLY =
  "Intervals, measures, product filters, and comparisons apply only to sales over time.";

/**
 * Grouping a result (AC-8): only product results group, by their `groupByFields`. While grouped,
 * a `limit` is the number of brands shown (1–30); category and department groups are all shown.
 */
function groupingIssue(
  capability: CapabilityDef,
  refinement: Refinement,
  current: ViewContext,
): Issue | null {
  const requested = refinement.group_by;
  if (requested && requested !== "none" && !capability.groupByFields.includes(requested))
    return {
      code: "invalid_operator",
      field: "group_by",
      message: `${capability.title} can't be grouped. Ask for product sales grouped by category, department, or brand instead.`,
    };
  const group = requested === "none" ? undefined : (requested ?? current.group_by);
  if (!group || refinement.limit === undefined) return null;
  if (group !== "brand")
    return {
      code: "invalid_value",
      field: "limit",
      message: `Every ${group} is shown when grouped by ${group}.`,
    };
  const n = refinement.limit;
  if (!Number.isInteger(n) || n < 1 || n > MAX_BRAND_GROUPS)
    return {
      code: "invalid_value",
      field: "limit",
      message: `Show between 1 and ${MAX_BRAND_GROUPS} brands.`,
    };
  return null;
}

const SERIES_NO_GROUPING =
  "Sales over time can't be grouped. Ask for product sales grouped by category, department, or brand instead.";
const SERIES_NO_CONCENTRATION =
  "Concentration compares customers or products, not sales over time. Ask for a summary to see the lowest and highest periods instead.";

/**
 * What a time series refuses (AC-7): it is always shown in date order with every bucket, so sort,
 * row limit, and value filters don't apply, and it cannot be grouped. Interval, measure, and
 * clearing filters are allowed.
 */
function seriesRefinementIssue(refinement: Refinement, interval: Interval): Issue | null {
  const instead = `Ask for the highest or lowest ${interval} instead.`;
  if (refinement.sort || refinement.limit !== undefined)
    return {
      code: "invalid_operator",
      field: refinement.sort ? "sort" : "limit",
      message: `Sales over time is shown in date order. ${instead}`,
    };
  if (refinement.filters?.length)
    return {
      code: "invalid_operator",
      field: "filters",
      message: `Sales over time shows every ${interval}, so it can't be filtered by value. ${instead}`,
    };
  if (refinement.group_by && refinement.group_by !== "none")
    return { code: "invalid_operator", field: "group_by", message: SERIES_NO_GROUPING };
  return null;
}

/** "a or b", "a, b, or c" */
const orList = (items: string[]) =>
  items.length <= 2 ? items.join(" or ") : `${items.slice(0, -1).join(", ")}, or ${items.at(-1)}`;

/**
 * An interval or measure on customer or product results. Says how to rank instead: the model
 * tends to send "top 10 brands by revenue" as a measure (TASK-005 DEC-003).
 */
function rankInstead(capability: CapabilityDef): string {
  const measures = orList(capability.fields.filter(isNumeric).map((f) => f.label.toLowerCase()));
  // A brand count also arrives as a measure (walkthrough), so no count is suggested; say what
  // grouping by brand shows.
  const brands = capability.groupByFields.includes("brand")
    ? ` Grouped by brand, the top ${DEFAULT_BRAND_GROUPS} brands are shown, with the rest combined as Other.`
    : "";
  return `Intervals and measures apply only to sales over time. To rank ${capability.rowNoun[1]}, ask to sort by ${measures}.${brands}`;
}

function timeSeriesOnly(
  refinement: Refinement | undefined,
  capability: CapabilityDef,
): Issue | null {
  for (const field of ["interval", "measure"] as const) {
    if (refinement?.[field] !== undefined)
      return { code: "invalid_value", field, message: rankInstead(capability) };
  }
  return null;
}

/**
 * Validates a data request's retrieval parameters and, for a time series, its interval and measure
 * (AC-3). Other capabilities accept none of them.
 */
export function validateRequestParameters(
  capabilityId: string,
  scope: Scope,
  parameters: RequestParameters | undefined,
  refinement: Refinement | undefined,
  /** A loaded series' current interval; a refinement without one keeps it (task review SF-1). */
  currentInterval?: Interval,
): Validated<{ parameters: RequestParameters; interval?: Interval; measure?: TimeSeriesMeasure }> {
  if (capabilityId !== SALES_TIME_SERIES) {
    if (parameters?.product_filter || parameters?.comparison)
      return fail({ code: "invalid_value", field: "parameters", message: TIME_SERIES_ONLY });
    const capability = getCapability(capabilityId);
    const issue = capability ? timeSeriesOnly(refinement, capability) : null;
    return issue ? fail(issue) : { ok: true, parameters: {} };
  }

  const filter = parameters?.product_filter;
  if (filter) {
    const options = filter.field === "category" ? THELOOK_CATEGORIES : DEPARTMENTS;
    if (filter.values.length === 0)
      return fail({
        code: "missing_value",
        field: filter.field,
        message: `Which ${filter.field}?`,
        validOptions: options,
      });
    if (filter.values.some((v) => !options.includes(v)))
      return fail({
        code: "value_not_allowed",
        field: filter.field,
        message: `Choose from the available ${filter.field} values.`,
        validOptions: options,
      });
  }

  const periods = [scope];
  const comparison = parameters?.comparison;
  if (comparison) {
    if (comparison.baseline === "custom") {
      const checked = validateScope(comparison);
      if (!checked.ok)
        return fail({
          ...checked.issue,
          field: "comparison",
          message: `Comparison period: ${checked.issue.message}`,
        });
    }
    periods.push(comparisonPeriod(scope, comparison));
  }

  const interval =
    refinement?.interval ?? currentInterval ?? seriesDefaultInterval(scope, parameters ?? {});
  if (interval === "day" && periods.some((p) => periodDays(p) > MAX_DAY_BUCKETS))
    return fail({
      code: "invalid_value",
      field: "interval",
      message: `Daily figures are available for periods up to ${MAX_DAY_BUCKETS} days. Choose weekly or monthly.`,
      validOptions: ["week", "month"],
    });

  const measure = refinement?.measure ?? "revenue";
  if (!(TIME_SERIES_MEASURES as readonly string[]).includes(measure))
    return fail({
      code: "invalid_value",
      field: "measure",
      message: "Sales over time can show revenue, orders, or items.",
      validOptions: [...TIME_SERIES_MEASURES],
    });

  return {
    ok: true,
    parameters: {
      ...(filter ? { product_filter: filter } : {}),
      ...(comparison ? { comparison } : {}),
    },
    interval,
    measure: measure as TimeSeriesMeasure,
  };
}
