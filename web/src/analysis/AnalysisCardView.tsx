import { Table, type TableColumn } from "../components/ui/Table";
import type { AnalysisCard } from "./api";
import { formatCell, formatCount, formatPercent, nounFor } from "./format";

type FigureRow = { figure: string; value: string };
const FIGURE_COLUMNS: TableColumn<FigureRow>[] = [
  { key: "figure", header: "Figure", rowHeader: true },
  { key: "value", header: "Value", numeric: true },
];

/** An analysis result's figures and its base, as an accessible table (TASK-003 AC-9, AC-16). */
export function AnalysisCardView({ card }: { card: AnalysisCard }) {
  const field = (name: string) => card.fields.find((f) => f.name === name);
  const label = (name: string) => field(name)?.label ?? name;
  const base =
    card.target === "complete"
      ? `All ${formatCount(card.baseCount)}`
      : `${formatCount(card.baseCount)} ${card.target}`;
  const noun = (count: number) => nounFor(card.rowNoun, count);
  const baseRow = { figure: "Based on", value: `${base} ${noun(card.baseCount)}` };

  if (card.operation === "concentration") {
    const m = field(card.measure);
    const rows: FigureRow[] = [
      baseRow,
      { figure: `Top ${card.rowNoun[1]}`, value: formatCount(card.topRows) },
      { figure: "Share", value: card.share === null ? "None" : formatPercent(card.share) },
      { figure: `Top ${label(card.measure).toLowerCase()}`, value: formatCell(m, card.topTotal) },
      { figure: `Total ${label(card.measure).toLowerCase()}`, value: formatCell(m, card.total) },
    ];
    const measure = label(card.measure).toLowerCase();
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3 sm:flex-row sm:items-center">
        {card.share !== null && (
          <ShareRing
            share={card.share}
            label={`Top ${formatCount(card.topRows)} ${noun(card.topRows)}: ${formatPercent(card.share)} of ${measure}`}
            caption={`of ${measure}`}
          />
        )}
        <div className="min-w-0 flex-1">
          <FigureTable caption={`Concentration of ${measure}`} rows={rows} />
        </div>
      </div>
    );
  }

  const m = field(card.field);
  const value = (x: number | null) => (x === null ? "None" : formatCell(m, x));
  // A time series names its lowest and highest bucket (TASK-005 AC-7).
  const named = (x: number | null, bucket: string | null | undefined) =>
    bucket && x !== null ? `${value(x)} (${bucket})` : value(x);
  const rows: FigureRow[] = [
    baseRow,
    { figure: "Total", value: value(card.total) },
    { figure: "Average", value: value(card.average) },
    { figure: "Median", value: value(card.median) },
    { figure: "Lowest", value: named(card.min, card.buckets?.lowest) },
    { figure: "Highest", value: named(card.max, card.buckets?.highest) },
  ];
  return <FigureTable caption={`Summary of ${label(card.field).toLowerCase()}`} rows={rows} />;
}

/**
 * A ring showing one share of a whole, with the share as text in the middle. It only draws a
 * figure the table beside it already states, so the table stays the evidence.
 */
function ShareRing({ share, label, caption }: { share: number; label: string; caption: string }) {
  // The circle's circumference is 100, so the dash length is the percentage.
  const percent = Math.min(100, Math.max(0, share * 100));
  return (
    <div role="img" aria-label={label} className="relative mx-auto size-32 shrink-0 sm:mx-0">
      <svg viewBox="0 0 36 36" className="size-full -rotate-90" aria-hidden="true">
        <circle
          cx="18"
          cy="18"
          r="15.9155"
          fill="none"
          strokeWidth="4"
          className="stroke-accent-subtle"
        />
        <circle
          cx="18"
          cy="18"
          r="15.9155"
          fill="none"
          strokeWidth="4"
          strokeDasharray={`${percent} ${100 - percent}`}
          className="stroke-chart-2"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-h3 text-fg tabular-nums">{formatPercent(share)}</span>
        <span className="text-caption text-fg-secondary">{caption}</span>
      </div>
    </div>
  );
}

function FigureTable({ caption, rows }: { caption: string; rows: FigureRow[] }) {
  return (
    <Table caption={caption} columns={FIGURE_COLUMNS} rows={rows} rowKey={(row) => row.figure} />
  );
}
