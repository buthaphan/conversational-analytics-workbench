import { Table, type TableColumn } from "../components/ui/Table";
import type { AnalysisCard, CellValue } from "./api";
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

  if (card.operation === "group") {
    const measures = card.fields.filter((f) => f.kind === "money" || f.kind === "integer");
    type GroupRow = Record<string, CellValue>;
    const columns: TableColumn<GroupRow>[] = [
      { key: "key", header: label(card.groupBy), rowHeader: true },
      {
        key: "rows",
        header: card.rowNoun[1].replace(/^./, (c) => c.toUpperCase()),
        numeric: true,
        format: (v) => formatCount(Number(v)),
      },
      ...measures.map((m) => ({
        key: m.name,
        header: m.label,
        numeric: true,
        format: (v: CellValue) => formatCell(m, v),
      })),
    ];
    return (
      <Table
        caption={`Totals by ${label(card.groupBy).toLowerCase()} (${base.toLowerCase()} ${noun(card.baseCount)})`}
        columns={columns}
        rows={card.groups}
        rowKey={(row) => String(row.key)}
      />
    );
  }

  if (card.operation === "concentration") {
    const m = field(card.measure);
    const rows: FigureRow[] = [
      baseRow,
      { figure: `Top ${card.rowNoun[1]}`, value: formatCount(card.topRows) },
      { figure: "Share", value: card.share === null ? "None" : formatPercent(card.share) },
      { figure: `Top ${label(card.measure).toLowerCase()}`, value: formatCell(m, card.topTotal) },
      { figure: `Total ${label(card.measure).toLowerCase()}`, value: formatCell(m, card.total) },
    ];
    return (
      <FigureTable caption={`Concentration of ${label(card.measure).toLowerCase()}`} rows={rows} />
    );
  }

  const m = field(card.field);
  const value = (x: number | null) => (x === null ? "None" : formatCell(m, x));
  const rows: FigureRow[] = [
    baseRow,
    { figure: "Total", value: value(card.total) },
    { figure: "Average", value: value(card.average) },
    { figure: "Median", value: value(card.median) },
    { figure: "Lowest", value: value(card.min) },
    { figure: "Highest", value: value(card.max) },
  ];
  return <FigureTable caption={`Summary of ${label(card.field).toLowerCase()}`} rows={rows} />;
}

function FigureTable({ caption, rows }: { caption: string; rows: FigureRow[] }) {
  return (
    <Table caption={caption} columns={FIGURE_COLUMNS} rows={rows} rowKey={(row) => row.figure} />
  );
}
