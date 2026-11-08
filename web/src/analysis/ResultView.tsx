import { ChartWithTable } from "../charts/ChartWithTable";
import { Card } from "../components/ui/Card";
import { Table, type TableColumn } from "../components/ui/Table";
import type { ActiveResult, Row } from "./api";
import { describeFilter, formatCell, formatCount, formatDateRange, nounFor } from "./format";

/** The active-scope summary: capability, dates, row counts, and filters (TASK-003 AC-16). */
export function ScopeSummary({ result }: { result: ActiveResult }) {
  const { rowNoun, rowCount, filteredCount, view } = result;
  return (
    <Card title={result.title} headingLevel={2}>
      <dl className="grid gap-x-6 gap-y-2 text-body-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-fg-secondary">Period</dt>
        <dd>{formatDateRange(result.scope)}</dd>
        <dt className="text-fg-secondary">Result</dt>
        <dd>
          {formatCount(rowCount)} {nounFor(rowNoun, rowCount)} in the result
          {view.filters.length > 0 && `; ${formatCount(filteredCount)} match the filters`}
        </dd>
        <dt className="text-fg-secondary">Filters</dt>
        <dd>
          {view.filters.length > 0
            ? view.filters.map((f) => describeFilter(result.fields, f)).join("; ")
            : "None"}
        </dd>
        <dt className="text-fg-secondary">Showing</dt>
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

/** The displayed rows as a bar chart with its table, or as a table of every field. */
export function ResultArea({ result }: { result: ActiveResult }) {
  const labelField = result.fields.find((f) => f.kind === "label") ?? result.fields[0]!;
  const idField = result.fields.find((f) => f.kind === "id") ?? labelField;
  const sortField = result.fields.find((f) => f.name === result.view.sort.field) ?? labelField;
  const order = result.view.sort.direction === "desc" ? "highest first" : "lowest first";
  const title = `${sortField.label} by ${labelField.label.toLowerCase()} (${order})`;

  if (result.view.view === "bar") {
    return (
      <Card>
        <ChartWithTable
          title={title}
          categoryLabel={labelField.label}
          categories={result.rows.map((r) => String(r[labelField.name]))}
          series={[
            { name: sortField.label, values: result.rows.map((r) => Number(r[sortField.name])) },
          ]}
          formatValue={(v) => formatCell(sortField, v)}
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
      />
    </Card>
  );
}
