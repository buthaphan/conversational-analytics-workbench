import { useId } from "react";
import { ChartWithTable, type ChartType } from "../charts/ChartWithTable";
import { Card } from "../components/ui/Card";
import { Icon, type IconName, IconTile } from "../components/ui/Icon";
import { Table, type TableColumn } from "../components/ui/Table";
import type {
  ActiveResult,
  FieldInfo,
  GroupDimension,
  GroupedView,
  GroupRow,
  Interval,
  Row,
  SeriesMeasure,
  SeriesView,
} from "./api";
import {
  describeFilter,
  formatCell,
  formatCount,
  formatDateRange,
  formatDays,
  formatPercent,
  formatPeriod,
  nounFor,
  signed,
} from "./format";

const INTERVAL_NAMES: Record<Interval, string> = { day: "Day", week: "Week", month: "Month" };
const GROUP_NOUNS: Record<GroupDimension, [string, string]> = {
  category: ["category", "categories"],
  department: ["department", "departments"],
  brand: ["brand", "brands"],
};
const SERIES_MEASURES: SeriesMeasure[] = ["revenue", "order_count", "item_count"];
const BASELINES = { previous_period: "previous period", previous_year: "previous year" } as const;

const fieldOf = (result: ActiveResult, name: string): FieldInfo =>
  result.fields.find((f) => f.name === name) ?? { name, label: name, kind: "integer" };
const orderPhrase = (result: ActiveResult) =>
  result.view.sort.direction === "desc" ? "highest first" : "lowest first";

/** The active-scope summary: capability, dates, row counts, filters, and TASK-005's settings. */
export function ScopeSummary({ result }: { result: ActiveResult }) {
  const { rowNoun, rowCount, filteredCount, view } = result;
  const sortLabel = fieldOf(result, view.sort.field).label.toLowerCase();
  const terms: [string, string][] = [["Period", formatDateRange(result.scope)]];

  if (result.series) {
    const filter = result.parameters?.product_filter;
    const comparison = result.parameters?.comparison;
    terms.push(
      ["Result", `${formatCount(rowCount)} ${nounFor(rowNoun, rowCount)} in the result`],
      ["Interval", `By ${result.series.interval}`],
      ["Measure", fieldOf(result, result.series.measure).label],
      [
        "Products",
        filter
          ? `${filter.field === "category" ? "Category" : "Department"}: ${filter.values.join(" or ")}`
          : "All products",
      ],
      [
        "Compared with",
        comparison && result.comparisonScope
          ? `${formatDateRange(result.comparisonScope)}${
              comparison.baseline === "custom" ? "" : ` (${BASELINES[comparison.baseline]})`
            }`
          : "No comparison",
      ],
    );
  } else {
    terms.push(
      [
        "Result",
        `${formatCount(rowCount)} ${nounFor(rowNoun, rowCount)} in the result${
          view.filters.length > 0 ? `; ${formatCount(filteredCount)} match the filters` : ""
        }`,
      ],
      [
        "Filters",
        view.filters.length > 0
          ? view.filters.map((f) => describeFilter(result.fields, f)).join("; ")
          : "None",
      ],
    );
    const grouped = result.grouped;
    if (grouped) {
      const [, many] = GROUP_NOUNS[grouped.groupBy];
      const shown = grouped.groups.length + (grouped.other ? 1 : 0);
      terms.push(
        [
          "Grouping",
          grouped.other
            ? `By ${grouped.groupBy}: top ${formatCount(grouped.groups.length)} of ${formatCount(grouped.groupCount)} ${many}, the rest as Other`
            : `By ${grouped.groupBy}: all ${formatCount(grouped.groupCount)} ${many}`,
        ],
        ["Showing", `${formatCount(shown)} groups, by ${sortLabel} (${orderPhrase(result)})`],
      );
    } else {
      terms.push([
        "Showing",
        `${formatCount(result.rows.length)} of ${formatCount(filteredCount)}, by ${sortLabel} (${orderPhrase(result)})`,
      ]);
    }
  }

  const headingId = useId();
  const [period, ...details] = terms;
  const titleIcon: IconName = result.series
    ? "lineChart"
    : result.grouped
      ? "pieChart"
      : "barChart";

  return (
    // Keeps its height on wide screens; the result card below takes the rest (TASK-005).
    // A strip: the title and period on the left, each setting with its icon beside it.
    <section
      aria-labelledby={headingId}
      className="flex shrink-0 flex-col gap-4 rounded-xl border border-border bg-surface px-5 py-4 text-fg shadow-md xl:flex-row xl:items-center"
    >
      <div className="flex min-w-0 items-center gap-3 xl:max-w-80">
        <IconTile name={titleIcon} tone="teal" />
        <div className="min-w-0">
          <h2 id={headingId} className="text-h3 text-fg">
            {result.title}
          </h2>
          {period && (
            <p className="text-body-sm text-fg-secondary">
              <span className="sr-only">{period[0]}</span>
              {period[1]}
            </p>
          )}
        </div>
      </div>
      <dl className="grid flex-1 grid-cols-1 gap-x-5 gap-y-3 text-body-sm sm:grid-cols-2 xl:flex xl:flex-wrap xl:justify-end">
        {details.map(([term, value]) => (
          <div
            key={term}
            className="flex min-w-0 flex-col gap-0.5 xl:max-w-64 xl:border-l xl:border-border xl:pl-5"
          >
            <dt className="flex items-center gap-1.5 text-caption font-semibold text-fg-secondary">
              <Icon name={TERM_ICONS[term] ?? "list"} className="size-4 text-accent" />
              {term}
            </dt>
            <dd className="text-fg">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const TERM_ICONS: Record<string, IconName> = {
  Result: "layers",
  Interval: "calendar",
  Measure: "measure",
  Products: "tag",
  "Compared with": "scale",
  Filters: "filter",
  Grouping: "group",
  Showing: "list",
};

/**
 * On wide screens the workspace column is exactly as tall as the window, and the result card fills
 * what the scope summary leaves (TASK-004 DEC-004). A table then takes the height left inside the
 * card and scrolls in its own region, however much else the card holds (a period-totals table, a
 * note, a second table), so the page never scrolls (TASK-005 walkthrough). Below the wide
 * breakpoint the page scrolls and the table keeps its small maximum height.
 */
const RESULT_CARD = "lg:min-h-0 lg:flex-1";
const FILL_TABLE = "lg:min-h-0 lg:max-h-none lg:flex-initial";
/**
 * The pie view has two tables in one card (its slices, then every group). Each keeps room for its
 * header and a few rows and scrolls, so neither is squeezed to nothing.
 */
const SHARED_TABLE = "lg:min-h-40 lg:max-h-none lg:flex-initial";

/** The main view of the active result, by its shape (TASK-005 AC-9, AC-11). */
export function ResultArea({ result }: { result: ActiveResult }) {
  if (result.series) return <SeriesArea result={result} series={result.series} />;
  if (result.grouped) return <GroupedArea result={result} grouped={result.grouped} />;
  return <RowsArea result={result} />;
}

/** The displayed rows as vertical or horizontal bars with their table, or a table of every field. */
function RowsArea({ result }: { result: ActiveResult }) {
  const labelField = result.fields.find((f) => f.kind === "label") ?? result.fields[0]!;
  const idField = result.fields.find((f) => f.kind === "id") ?? labelField;
  const sortField = fieldOf(result, result.view.sort.field);
  const title = `${sortField.label} by ${labelField.label.toLowerCase()} (${orderPhrase(result)})`;

  if (result.view.view === "bar" || result.view.view === "horizontal_bar") {
    return (
      // Stretches on wide screens; the chart takes the spare height (TASK-004 DEC-004).
      <Card className={RESULT_CARD} stretch>
        <ChartWithTable
          title={title}
          type={result.view.view}
          categoryLabel={labelField.label}
          categories={result.rows.map((r) => String(r[labelField.name]))}
          series={[
            { name: sortField.label, values: result.rows.map((r) => Number(r[sortField.name])) },
          ]}
          formatValue={(v) => formatCell(sortField, v)}
          compact
          tableClassName={FILL_TABLE}
        />
      </Card>
    );
  }

  const ordered = [labelField, ...result.fields.filter((f) => f !== labelField)];
  const columns: TableColumn<Row>[] = ordered.map((field) => ({
    key: field.name,
    header: field.label,
    rowHeader: field === labelField,
    numeric: field.kind === "money" || field.kind === "integer",
    format: (value) => formatCell(field, value),
  }));
  return (
    <Card className={RESULT_CARD} stretch>
      <Table
        caption={title}
        columns={columns}
        rows={result.rows}
        rowKey={(row) => String(row[idField.name])}
        emptyMessage={`No ${result.rowNoun[1]} match the filters.`}
        maxHeight="md"
        dense
        className={FILL_TABLE}
      />
    </Card>
  );
}

/**
 * A time series (S2, S6, S7): one line (or bars) by the interval, or two aligned by bucket
 * position with a comparison, each period's real dates in the table, and the period totals.
 */
function SeriesArea({ result, series }: { result: ActiveResult; series: SeriesView }) {
  const measure = fieldOf(result, series.measure);
  const format = (v: number) => formatCell(measure, v);
  const title = `${measure.label} by ${series.interval}`;
  const label = (b: SeriesView["main"][number]) => `${b.label}${b.partial ? " (partial)" : ""}`;
  const comparison = series.comparison;
  // Every view name is a chart type; "table" shows the table alone.
  const type: ChartType = result.view.view;

  if (!comparison || !result.comparisonScope) {
    return (
      <Card className={RESULT_CARD} stretch>
        <ChartWithTable
          title={title}
          type={type}
          categoryLabel={INTERVAL_NAMES[series.interval]}
          categories={series.main.map(label)}
          series={[{ name: measure.label, values: series.main.map((b) => b[series.measure]) }]}
          extraColumns={[
            { header: "Dates", values: series.main.map((b) => formatDays(b.firstDay, b.lastDay)) },
          ]}
          formatValue={format}
          compact
          tableClassName={FILL_TABLE}
        />
      </Card>
    );
  }

  // Bucket k of the period pairs with bucket k of the comparison period; a shorter one leaves gaps.
  const n = Math.max(series.main.length, comparison.length);
  const at = <T,>(list: T[], k: number) => list[k];
  const value = (b: SeriesView["main"][number] | undefined) => (b ? b[series.measure] : null);
  const categories = Array.from({ length: n }, (_, k) => {
    const main = at(series.main, k);
    return main ? label(main) : `${label(at(comparison, k)!)} (compared)`;
  });
  const days = (b: SeriesView["main"][number] | undefined) =>
    b ? formatDays(b.firstDay, b.lastDay) : "";
  const change = (k: number) => {
    const a = value(at(series.main, k));
    const b = value(at(comparison, k));
    if (a === null || b === null) return "";
    // Money in whole cents, so the difference is exact.
    const scale = measure.kind === "money" ? 100 : 1;
    return signed((Math.round(a * scale) - Math.round(b * scale)) / scale, format);
  };
  // Short period names keep the legend and the tables narrow (walkthrough W3).
  const mainName = formatPeriod(result.scope);
  const comparedName = formatPeriod(result.comparisonScope);

  return (
    <Card className={RESULT_CARD} stretch>
      <ChartWithTable
        title={title}
        type={type}
        categoryLabel={INTERVAL_NAMES[series.interval]}
        categories={categories}
        series={[
          { name: mainName, values: categories.map((_, k) => value(at(series.main, k))) },
          { name: comparedName, values: categories.map((_, k) => value(at(comparison, k))) },
        ]}
        extraColumns={[
          { header: "Dates", values: categories.map((_, k) => days(at(series.main, k))) },
          { header: "Compared dates", values: categories.map((_, k) => days(at(comparison, k))) },
          { header: "Change", values: categories.map((_, k) => change(k)) },
        ]}
        formatValue={format}
        compact
        tableClassName={FILL_TABLE}
      />
      <PeriodTotals
        result={result}
        series={series}
        mainName={mainName}
        comparedName={comparedName}
      />
    </Card>
  );
}

type TotalsRow = {
  measure: string;
  main: string;
  compared: string;
  change: string;
  percent: string;
};

/** Each period's total per measure, the change, and the % change (AC-5); none from zero. */
function PeriodTotals({
  result,
  series,
  mainName,
  comparedName,
}: {
  result: ActiveResult;
  series: SeriesView;
  mainName: string;
  comparedName: string;
}) {
  const { main, comparison, change } = series.totals;
  if (!comparison || !change) return null;
  const rows: TotalsRow[] = SERIES_MEASURES.map((m) => {
    const field = fieldOf(result, m);
    const f = (v: number) => formatCell(field, v);
    const { amount, percent } = change[m];
    return {
      measure: field.label,
      main: f(main[m]),
      compared: f(comparison[m]),
      change: signed(amount, f),
      percent: percent === null ? "None (from zero)" : signed(percent, formatPercent),
    };
  });
  const columns: TableColumn<TotalsRow>[] = [
    { key: "measure", header: "Measure", rowHeader: true },
    { key: "main", header: mainName, numeric: true },
    { key: "compared", header: comparedName, numeric: true },
    { key: "change", header: "Change", numeric: true },
    { key: "percent", header: "% change", numeric: true },
  ];
  return (
    // Three rows; it keeps its height while the bucket table above scrolls.
    <Table
      caption="Period totals"
      columns={columns}
      rows={rows}
      rowKey={(r) => r.measure}
      dense
      className="shrink-0"
    />
  );
}

/**
 * A grouped product result (S1, S3, S10): bars or horizontal bars with "Other" listed but not
 * drawn (DEC-001), a pie of at most 6 slices with every group listed below, or the table.
 */
function GroupedArea({ result, grouped }: { result: ActiveResult; grouped: GroupedView }) {
  const [, many] = GROUP_NOUNS[grouped.groupBy];
  const dimension = fieldOf(result, grouped.groupBy);
  const measure = fieldOf(result, result.view.sort.field);
  const others = result.fields.filter(
    (f) => (f.kind === "money" || f.kind === "integer") && f.name !== measure.name,
  );
  const format = (v: number) => formatCell(measure, v);
  const title = `${measure.label} by ${grouped.groupBy} (${orderPhrase(result)})`;
  const otherLabel = (n: number) =>
    `Other (${formatCount(n)} ${n === 1 ? GROUP_NOUNS[grouped.groupBy][0] : many})`;
  // Products and the other measures, preformatted, as table-only columns.
  const extraHeaders = ["Products", ...others.map((f) => f.label)];
  const extra = (g: GroupRow) => [
    formatCount(g.product_count),
    ...others.map((f) => formatCell(f, g[f.name])),
  ];
  const view = result.view.view;

  const groupTable = (
    tableTitle: string,
    type: ChartType,
    note?: string,
    tableClassName = FILL_TABLE,
  ) => (
    <ChartWithTable
      title={tableTitle}
      type={type}
      categoryLabel={dimension.label}
      categories={grouped.groups.map((g) => g.key)}
      series={[{ name: measure.label, values: grouped.groups.map((g) => Number(g[measure.name])) }]}
      extraColumns={extraHeaders.map((header, k) => ({
        header,
        values: grouped.groups.map((g) => extra(g)[k] ?? ""),
      }))}
      tableOnlyRows={
        grouped.other
          ? [
              {
                category: otherLabel(grouped.other.groups),
                values: [Number(grouped.other[measure.name])],
                extra: extra(grouped.other),
              },
            ]
          : []
      }
      {...(note ? { note } : {})}
      formatValue={format}
      compact
      tableClassName={tableClassName}
    />
  );

  if (view === "pie" && grouped.pie) {
    const { slices, other } = grouped.pie;
    const drawn = [...slices, ...(other ? [other] : [])];
    return (
      <Card className={RESULT_CARD} stretch>
        <ChartWithTable
          title={`${measure.label} by ${grouped.groupBy} (pie)`}
          type="pie"
          categoryLabel={dimension.label}
          categories={drawn.map((s) => (s === other ? otherLabel(other.groups) : s.key))}
          series={[{ name: measure.label, values: drawn.map((s) => Number(s[measure.name])) }]}
          extraColumns={[{ header: "Share", values: drawn.map((s) => formatPercent(s.share)) }]}
          formatValue={format}
          compact
          tableClassName={SHARED_TABLE}
        />
        {/* Every category or department; for brands, the brand cap plus "Other" (DEC-004). */}
        {groupTable(
          grouped.other
            ? `${many.charAt(0).toUpperCase()}${many.slice(1)}: top ${formatCount(grouped.groups.length)} and "Other"`
            : `All ${many}`,
          "table",
          undefined,
          SHARED_TABLE,
        )}
      </Card>
    );
  }

  if (view === "bar" || view === "horizontal_bar") {
    let note: string | undefined;
    if (grouped.other) {
      const cents = (g: GroupRow) => Math.round(Number(g[measure.name]) * 100);
      const total = grouped.groups.reduce((s, g) => s + cents(g), 0) + cents(grouped.other);
      const share = total > 0 ? cents(grouped.other) / total : 0;
      note = `"Other" (${formatCount(grouped.other.groups)} ${many}, ${formatPercent(share)} of ${measure.label.toLowerCase()}) is listed in the table but not drawn, so the other bars stay readable.`;
    }
    return (
      <Card className={RESULT_CARD} stretch>
        {groupTable(title, view, note)}
      </Card>
    );
  }

  return (
    <Card className={RESULT_CARD} stretch>
      {groupTable(title, "table")}
    </Card>
  );
}
