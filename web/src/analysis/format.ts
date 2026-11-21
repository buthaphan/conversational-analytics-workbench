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

const parts = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return { day: d.getUTCDate(), month: d.getUTCMonth(), year: d.getUTCFullYear() };
};

/**
 * Days, first and last inclusive, without repeating the shared month or year, so series tables stay
 * narrow (TASK-005 S6, walkthrough W3): "6 Jan 2025", "1–31 Jan 2024", "27 Jan – 2 Feb 2025",
 * "30 Dec 2024 – 5 Jan 2025".
 */
export function formatDays(first: string, last: string): string {
  const a = parts(first);
  const b = parts(last);
  const month = (p: { month: number }) => MONTHS[p.month];
  if (first === last) return `${a.day} ${month(a)} ${a.year}`;
  if (a.year !== b.year) return `${a.day} ${month(a)} ${a.year} – ${b.day} ${month(b)} ${b.year}`;
  if (a.month !== b.month) return `${a.day} ${month(a)} – ${b.day} ${month(b)} ${b.year}`;
  return `${a.day}–${b.day} ${month(b)} ${b.year}`;
}

/**
 * A period's short name for legends and table headers (walkthrough W3): whole calendar years
 * ("2025", "2023 – 2024"), whole months ("Mar 2025", "Jan – Feb 2025", "Nov 2024 – Feb 2025"),
 * otherwise its days.
 */
export function formatPeriod(scope: Scope): string {
  const lastDay = new Date(Date.parse(`${scope.end_date}T00:00:00Z`) - DAY)
    .toISOString()
    .slice(0, 10);
  const a = parts(scope.start_date);
  const end = parts(scope.end_date);
  const b = parts(lastDay);
  if (a.day !== 1 || end.day !== 1) return formatDays(scope.start_date, lastDay);
  if (a.month === 0 && end.month === 0)
    return a.year === b.year ? `${a.year}` : `${a.year} – ${b.year}`;
  if (a.year === b.year && a.month === b.month) return `${MONTHS[a.month]} ${a.year}`;
  return a.year === b.year
    ? `${MONTHS[a.month]} – ${MONTHS[b.month]} ${b.year}`
    : `${MONTHS[a.month]} ${a.year} – ${MONTHS[b.month]} ${b.year}`;
}

/** A change with its sign: "+$50.00", "−2" (a true minus sign), or no sign for zero. */
export function signed(value: number, format: (v: number) => string): string {
  if (value > 0) return `+${format(value)}`;
  if (value < 0) return `−${format(-value)}`;
  return format(0);
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
