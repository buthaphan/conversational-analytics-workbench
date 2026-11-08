import { registerTheme } from "echarts";
import ReactECharts from "echarts-for-react";
import { useId } from "react";
import { Table, type TableColumn } from "../components/ui/Table";
import { cn } from "../lib/cn";
import { CHART_THEME_NAME, chartTheme } from "./chartTheme";

registerTheme(CHART_THEME_NAME, chartTheme);

export interface ChartSeries {
  name: string;
  /** One value per category, in category order. */
  values: number[];
}

export interface ChartWithTableProps {
  title: string;
  /** Header for the category column in the table, e.g. "Month". */
  categoryLabel: string;
  categories: string[];
  series: ChartSeries[];
  type?: "bar" | "line";
  formatValue?: (value: number) => string;
  /** A shorter chart, and the table in its own scroll region, so the whole view fits one screen. */
  compact?: boolean;
  /** Extra classes for the table region, e.g. a window-based maximum height. */
  tableClassName?: string;
}

type TableRow = Record<string, string | number>;

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

  const rows: TableRow[] = categories.map((category, i) => ({
    // Position, not label, identifies a row: category labels may repeat.
    rowIndex: i,
    category,
    ...Object.fromEntries(series.map((s, j) => [`s${j}`, s.values[i] ?? ""])),
  }));

  const columns: TableColumn<TableRow>[] = [
    { key: "category", header: categoryLabel, rowHeader: true },
    ...series.map((s, j) => ({
      key: `s${j}`,
      header: s.name,
      numeric: true,
      format: (value: TableRow[string]) => (typeof value === "number" ? formatValue(value) : value),
    })),
  ];

  const option = {
    legend: { show: series.length > 0, top: 0 },
    grid: { left: 8, right: 16, top: 40, bottom: 8, containLabel: true },
    tooltip: { trigger: "axis", valueFormatter: (v: number) => formatValue(v) },
    xAxis: { type: "category", data: categories },
    yAxis: { type: "value" },
    series: series.map((s) => ({ name: s.name, type, data: s.values })),
  };

  return (
    <figure
      aria-labelledby={captionId}
      // Compact: on wide screens the figure fills its container and the chart takes the spare height.
      className={cn("flex flex-col", compact ? "gap-3 lg:flex-1" : "gap-4")}
    >
      <figcaption id={captionId} className="text-h3 text-fg">
        {title}
      </figcaption>
      {categories.length === 0 ? (
        <p className="text-body-sm text-fg-secondary">No data to chart.</p>
      ) : (
        <div
          role="img"
          aria-label={`${title} chart. Exact values are in the table below.`}
          className={cn("w-full", compact ? "h-56 min-h-56 lg:h-auto lg:flex-1" : "h-80")}
        >
          <ReactECharts
            option={option}
            theme={CHART_THEME_NAME}
            style={{ height: "100%", width: "100%" }}
          />
        </div>
      )}
      <Table
        caption={title}
        columns={columns}
        rows={rows}
        rowKey={(row) => String(row.rowIndex)}
        {...(compact ? { maxHeight: "sm" as const, dense: true, hideCaption: true } : {})}
        {...(tableClassName ? { className: tableClassName } : {})}
      />
    </figure>
  );
}
