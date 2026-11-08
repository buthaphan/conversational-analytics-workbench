import type { CellValue, FieldInfo, Filter, Scope } from "./api";

/**
 * Display formatting for values the backend computed (TASK-003 AC-10). The rules match the API's
 * answer templates: USD with 2 decimals, thousands separators, percentages to 1 decimal place, and
 * date ranges with the exclusive end shown as the last included day.
 */

const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const COUNT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY = 24 * 60 * 60 * 1000;

export const formatMoney = (value: number) => MONEY.format(value);
export const formatCount = (value: number) => COUNT.format(value);
export const formatPercent = (share: number) => `${(share * 100).toFixed(1)}%`;

const formatDate = (date: Date) =>
  `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;

export function formatDateRange(scope: Scope): string {
  const start = new Date(`${scope.start_date}T00:00:00Z`);
  const last = new Date(new Date(`${scope.end_date}T00:00:00Z`).getTime() - DAY);
  return last.getTime() === start.getTime()
    ? formatDate(start)
    : `${formatDate(start)} – ${formatDate(last)}`;
}

/** Formats a cell by its field kind: money as currency, integers with separators, text unchanged. */
export function formatCell(
  field: FieldInfo | undefined,
  value: CellValue | null | undefined,
): string {
  if (value === null || value === undefined) return "";
  if (field?.kind === "money") return formatMoney(Number(value));
  if (field?.kind === "integer") return formatCount(Number(value));
  return String(value);
}

export const nounFor = (rowNoun: [string, string], count: number) =>
  count === 1 ? rowNoun[0] : rowNoun[1];

export function describeFilter(fields: FieldInfo[], filter: Filter): string {
  const field = fields.find((f) => f.name === filter.field);
  const name = field?.label ?? filter.field;
  const v = (x: number | undefined) => formatCell(field, x ?? 0);
  switch (filter.op) {
    case "gt":
      return `${name} over ${v(filter.value)}`;
    case "gte":
      return `${name} of at least ${v(filter.value)}`;
    case "lt":
      return `${name} under ${v(filter.value)}`;
    case "lte":
      return `${name} of at most ${v(filter.value)}`;
    case "between":
      return `${name} between ${v(filter.min)} and ${v(filter.max)}`;
    case "in":
      return `${name}: ${(filter.values ?? []).join(" or ")}`;
  }
}
