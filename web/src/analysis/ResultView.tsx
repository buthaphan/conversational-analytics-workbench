import { ChartWithTable } from "../charts/ChartWithTable";
import { Card } from "../components/ui/Card";
import { Table, type TableColumn } from "../components/ui/Table";
import type { ActiveResult, Row } from "./api";
import { describeFilter, formatCell, formatCount, formatDateRange, nounFor } from "./format";

/** The active-scope summary: capability, dates, row counts, and filters (TASK-003 AC-16). */
export function ScopeSummary({ result }: { result: ActiveResult }) {
  const { rowNoun, rowCount, filteredCount, view } = result;
  return (
    <Card title={result.title} headingLevel={2} compact>
      {/* Compact: two term/value pairs per row on wide screens, small text (TASK-004 DEC-004). */}
      <dl className="grid gap-x-4 gap-y-1 text-body-sm sm:grid-cols-[auto_1fr] xl:grid-cols-[auto_1fr_auto_1fr]">
        <dt className="font-semibold">Period</dt>
        <dd>{formatDateRange(result.scope)}</dd>
        <dt className="font-semibold">Result</dt>
        <dd>
          {formatCount(rowCount)} {nounFor(rowNoun, rowCount)} in the result
          {view.filters.length > 0 && `; ${formatCount(filteredCount)} match the filters`}
        </dd>
        <dt className="font-semibold">Filters</dt>
        <dd>
          {view.filters.length > 0
            ? view.filters.map((f) => describeFilter(result.fields, f)).join("; ")
            : "None"}
        </dd>
        <dt className="font-semibold">Showing</dt>
        <dd>
          {formatCount(result.rows.length)} of {formatCount(filteredCount)}, by{" "}
          {(
            result.fields.find((f) => f.name === view.sort.field)?.label ?? view.sort.field
          ).toLowerCase()}{" "}
          ({view.sort.direction === "desc" ? "highest" : "lowest"} first)
        </dd>
      </dl>
    </Card>
  );
}

/**
 * On wide screens the table takes the window height left after the header, the scope summary, and
 * (in the bar view) the chart, so the page itself does not scroll; never less than 10rem
 * (TASK-004 DEC-004). The offsets are those fixed parts in rem.
 */
const FILL_WITH_CHART = "lg:max-h-[max(10rem,calc(100vh_-_37rem))]";
const FILL_TABLE_ONLY = "lg:max-h-[max(10rem,calc(100vh_-_21rem))]";

/** The displayed rows as a bar chart with its table, or as a table of every field. */
export function ResultArea({ result }: { result: ActiveResult }) {
  const labelField = result.fields.find((f) => f.kind === "label") ?? result.fields[0]!;
  const idField = result.fields.find((f) => f.kind === "id") ?? labelField;
  const sortField = result.fields.find((f) => f.name === result.view.sort.field) ?? labelField;
  const order = result.view.sort.direction === "desc" ? "highest first" : "lowest first";
  const title = `${sortField.label} by ${labelField.label.toLowerCase()} (${order})`;

  if (result.view.view === "bar") {
    return (
      // Stretches on wide screens; the chart takes the spare height (TASK-004 DEC-004).
      <Card className="lg:flex-1" stretch>
        <ChartWithTable
          title={title}
          categoryLabel={labelField.label}
          categories={result.rows.map((r) => String(r[labelField.name]))}
          series={[
            { name: sortField.label, values: result.rows.map((r) => Number(r[sortField.name])) },
          ]}
          formatValue={(v) => formatCell(sortField, v)}
          compact
          tableClassName={FILL_WITH_CHART}
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
    <Card>
      <Table
        caption={title}
        columns={columns}
        rows={result.rows}
        rowKey={(row) => String(row[idField.name])}
        emptyMessage={`No ${result.rowNoun[1]} match the filters.`}
        maxHeight="md"
        dense
        className={FILL_TABLE_ONLY}
      />
    </Card>
  );
}
