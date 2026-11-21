import { registerTheme } from "echarts";
import ReactECharts from "echarts-for-react";
import { type ReactNode, useId } from "react";
import { Table, type TableColumn } from "../components/ui/Table";
import { cn } from "../lib/cn";
import { CHART_THEME_NAME, chartTheme } from "./chartTheme";

registerTheme(CHART_THEME_NAME, chartTheme);

export interface ChartSeries {
  name: string;
  /** One value per category, in category order; null leaves a gap (a line without a value). */
  values: (number | null)[];
}

/** `table` shows the table alone (TASK-005 AC-9). */
export type ChartType = "bar" | "horizontal_bar" | "line" | "pie" | "table";

/** A column shown in the table only, with one preformatted value per category. */
export interface ExtraColumn {
  header: string;
  values: string[];
}

/** A row shown in the table only, e.g. an "Other" row that would dwarf the bars (DEC-001). */
export interface TableOnlyRow {
  category: string;
  values: (number | null)[];
  /** One value per extra column. */
  extra?: string[];
}

export interface ChartWithTableProps {
  title: string;
  /** Header for the category column in the table, e.g. "Month". */
  categoryLabel: string;
  categories: string[];
  series: ChartSeries[];
  type?: ChartType;
  formatValue?: (value: number) => string;
  extraColumns?: ExtraColumn[];
  tableOnlyRows?: TableOnlyRow[];
  /** Shown under the chart, e.g. why a row is in the table but not drawn. */
  note?: ReactNode;
  /** A shorter chart, and the table in its own scroll region, so the whole view fits one screen. */
  compact?: boolean;
  /** Extra classes for the table region, e.g. a window-based maximum height. */
  tableClassName?: string;
}

type TableRow = Record<string, string | number>;

function chartOption(
  type: Exclude<ChartType, "table">,
  categories: string[],
  series: ChartSeries[],
  formatValue: (value: number) => string,
) {
  const legend = { show: series.length > 0, bottom: 0, icon: "roundRect" };
  if (type === "pie") {
    const s = series[0] ?? { name: "", values: [] };
    return {
      legend,
      tooltip: { trigger: "item", valueFormatter: (v: number) => formatValue(v) },
      series: [
        {
          name: s.name,
          type: "pie",
          radius: ["0%", "65%"],
          bottom: 32,
          data: categories.map((name, i) => ({ name, value: s.values[i] })),
          // Every slice carries its name and share as text, so color is not the only cue.
          label: { show: true, formatter: "{b}: {d}%" },
        },
      ],
    };
  }
  const categoryAxis = { type: "category", data: categories };
  const valueAxis = { type: "value" };
  const horizontal = type === "horizontal_bar";
  return {
    legend,
    grid: { left: 8, right: 16, top: 16, bottom: 32, containLabel: true },
    tooltip: { trigger: "axis", valueFormatter: (v: number) => formatValue(v) },
    // Horizontal bars: categories down the side, the first (largest) at the top, every label shown
    // (the chart grows with the number of bars, walkthrough W4).
    xAxis: horizontal ? valueAxis : categoryAxis,
    yAxis: horizontal ? { ...categoryAxis, inverse: true, axisLabel: { interval: 0 } } : valueAxis,
    series: series.map((s) => ({
      name: s.name,
      type: horizontal ? "bar" : type,
      data: s.values,
      // A single line is shaded underneath; with two lines a fill would hide the comparison.
      ...(type === "line" && series.length === 1 ? { areaStyle: { opacity: 0.12 } } : {}),
      // Horizontal bars round their outer end.
      ...(horizontal ? { itemStyle: { borderRadius: [0, 4, 4, 0] } } : {}),
    })),
  };
}

/**
 * A chart that always comes with an accessible table of the exact values it shows.
 * The chart is presentation only; the table is the evidence.
 */
export function ChartWithTable({
  title,
  categoryLabel,
  categories,
  series,
  type = "bar",
  formatValue = (v) => String(v),
  extraColumns = [],
  tableOnlyRows = [],
  note,
  compact = false,
  tableClassName,
}: ChartWithTableProps) {
  const captionId = useId();

  for (const s of series) {
    if (s.values.length !== categories.length) {
      throw new Error(
        `Series "${s.name}" has ${s.values.length} values but there are ${categories.length} categories; lengths must match.`,
      );
    }
  }

  const row = (
    rowIndex: number,
    category: string,
    values: (number | null)[],
    extra: string[],
  ): TableRow => ({
    // Position, not label, identifies a row: category labels may repeat.
    rowIndex,
    category,
    ...Object.fromEntries(series.map((_, j) => [`s${j}`, values[j] ?? ""])),
    ...Object.fromEntries(extraColumns.map((_, k) => [`x${k}`, extra[k] ?? ""])),
  });
  const rows: TableRow[] = [
    ...categories.map((category, i) =>
      row(
        i,
        category,
        series.map((s) => s.values[i] ?? null),
        extraColumns.map((c) => c.values[i] ?? ""),
      ),
    ),
    ...tableOnlyRows.map((r, i) => row(categories.length + i, r.category, r.values, r.extra ?? [])),
  ];

  const columns: TableColumn<TableRow>[] = [
    { key: "category", header: categoryLabel, rowHeader: true },
    ...series.map((s, j) => ({
      key: `s${j}`,
      header: s.name,
      numeric: true,
      format: (value: TableRow[string]) => (typeof value === "number" ? formatValue(value) : value),
    })),
    ...extraColumns.map((c, k) => ({ key: `x${k}`, header: c.header, numeric: true })),
  ];

  return (
    <figure
      aria-labelledby={captionId}
      // Compact: on wide screens the figure fills its container and the chart takes the spare height;
      // it may shrink so its table, not the page, scrolls (TASK-005).
      className={cn("flex flex-col", compact ? "gap-3 lg:min-h-0 lg:flex-1" : "gap-4")}
    >
      <figcaption id={captionId} className="text-h3 text-fg">
        {title}
      </figcaption>
      {type === "table" ? null : categories.length === 0 ? (
        <p className="text-body-sm text-fg-secondary">No data to chart.</p>
      ) : (
        <div
          role="img"
          aria-label={`${title} chart. Exact values are in the table below.`}
          className={cn("w-full", compact ? "h-56 min-h-56 lg:h-auto lg:flex-1" : "h-80")}
          // Horizontal bars need room for every label: 1rem per bar plus legend and axis, at least
          // the usual 14rem (walkthrough W4).
          {...(type === "horizontal_bar"
            ? { style: { minHeight: `${Math.max(14, categories.length + 4)}rem` } }
            : {})}
        >
          <ReactECharts
            option={chartOption(type, categories, series, formatValue)}
            theme={CHART_THEME_NAME}
            // Replace, not merge: otherwise a view change (bar to pie) keeps the old axes.
            notMerge
            style={{ height: "100%", width: "100%" }}
          />
        </div>
      )}
      {note && <p className="text-body-sm text-fg-secondary">{note}</p>}
      <Table
        caption={title}
        columns={columns}
        rows={rows}
        rowKey={(r) => String(r.rowIndex)}
        {...(compact ? { maxHeight: "sm" as const, dense: true, hideCaption: true } : {})}
        {...(tableClassName ? { className: tableClassName } : {})}
      />
    </figure>
  );
}
