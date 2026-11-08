/**
 * Backend-owned capability registry (TASK-003 AC-2). The AI may only name these capabilities and
 * fields; every value is validated here before any data operation. Semantics follow
 * docs/product/AI-DATA-CAPABILITIES.md.
 */

export type CapabilityId = "customer_spending" | "product_sales_performance";
export type FieldKind = "id" | "label" | "money" | "integer" | "category";
export type AnalysisTarget = "complete" | "filtered" | "displayed";

export interface FieldDef {
  name: string;
  kind: FieldKind;
  /** Short heading for tables and templates. */
  label: string;
  /** Meaning and unit, sent to the model (AC-5). */
  description: string;
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
/** Placeholder until TASK-004 profiles the real data. */
export const DEFAULT_ROW_CAP = 100_000;

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
    rowCap: DEFAULT_ROW_CAP,
  },
  product_sales_performance: {
    id: "product_sales_performance",
    title: "Product sales performance",
    description:
      "Compares individual products by sales results in a date range: one row per product with its category, revenue, and number of completed items sold.",
    whenToUse:
      "Which products earned the most revenue or sold the most units, lowest-selling products, products within a category. Not for category-, brand-, or department-level totals as the primary question.",
    clarifyWhen:
      "Whether 'top-selling' means revenue or units when the conversation does not settle it.",
    rowNoun: ["product", "products"],
    fields: [
      { name: "product_id", kind: "id", label: "Product ID", description: "Product identifier." },
      { name: "product_name", kind: "label", label: "Product", description: "Product name." },
      { name: "category", kind: "category", label: "Category", description: "Product category." },
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
    groupByFields: ["category"],
    rowCap: DEFAULT_ROW_CAP,
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
        validOptions: allowed[field.name],
      };
    const options = allowed[field.name] ?? [];
    if (filter.values.some((v) => !options.includes(v))) {
      return {
        code: "value_not_allowed",
        field: field.name,
        message: `Choose from the available ${field.label.toLowerCase()} values.`,
        validOptions: options,
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

export function validateRefinement(
  capabilityId: CapabilityId,
  refinement: Refinement,
  allowed: AllowedValues,
): Validated<{ refinement: Refinement }> {
  const capability = CAPABILITIES[capabilityId];
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
  if (
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

export interface Analysis {
  operation: "summary" | "concentration" | "group";
  field?: string;
  measure?: string;
  top_count?: number;
  top_percent?: number;
  group_by?: string;
  target: AnalysisTarget;
}

export function validateAnalysis(
  capabilityId: CapabilityId,
  analysis: Analysis,
): Validated<{ analysis: Analysis }> {
  const capability = CAPABILITIES[capabilityId];
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
  if (analysis.operation === "concentration") {
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
    if (top_count !== undefined && !(Number.isInteger(top_count) && top_count >= 1)) {
      return fail({
        code: "invalid_value",
        field: "top_count",
        message: "The top count must be a whole number of at least 1.",
      });
    }
    return { ok: true, analysis };
  }
  if (!analysis.group_by || !capability.groupByFields.includes(analysis.group_by)) {
    return fail({
      code: "unknown_field",
      field: analysis.group_by,
      message: `This result cannot be grouped by "${analysis.group_by ?? ""}".`,
      validOptions: capability.groupByFields,
    });
  }
  return { ok: true, analysis };
}
