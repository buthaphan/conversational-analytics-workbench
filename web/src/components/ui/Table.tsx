import { type ReactNode, useId } from "react";
import { cn } from "../../lib/cn";

export interface TableColumn<Row> {
  key: keyof Row & string;
  header: string;
  /** Right-aligns the column and uses tabular figures. */
  numeric?: boolean;
  /** Renders this column's cells as row headers (`th scope="row"`). */
  rowHeader?: boolean;
  format?: (value: Row[keyof Row], row: Row) => ReactNode;
}

export interface TableProps<Row> {
  caption: string;
  columns: TableColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  emptyMessage?: string;
  className?: string;
}

export function Table<Row>({
  caption,
  columns,
  rows,
  rowKey,
  emptyMessage = "No data to show.",
  className,
}: TableProps<Row>) {
  const captionId = useId();
  const align = (column: TableColumn<Row>) =>
    column.numeric ? "text-right tabular-nums" : "text-left";

  return (
    <div
      role="region"
      aria-labelledby={captionId}
      tabIndex={0}
      className={cn(
        "overflow-x-auto rounded-lg border border-border bg-surface",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        className,
      )}
    >
      <table className="w-full border-collapse text-body-sm text-fg">
        <caption id={captionId} className="px-4 py-3 text-left text-label text-fg">
          {caption}
        </caption>
        <thead className="bg-surface-muted">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  "border-b border-border px-4 py-2 font-semibold whitespace-nowrap text-fg-secondary",
                  align(column),
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-6 text-center text-fg-secondary">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-border last:border-b-0">
                {columns.map((column) => {
                  const value = row[column.key];
                  const content = column.format ? column.format(value, row) : String(value ?? "");
                  const cellClass = cn("px-4 py-2 whitespace-nowrap", align(column));
                  return column.rowHeader ? (
                    <th key={column.key} scope="row" className={cn(cellClass, "font-medium")}>
                      {content}
                    </th>
                  ) : (
                    <td key={column.key} className={cellClass}>
                      {content}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
