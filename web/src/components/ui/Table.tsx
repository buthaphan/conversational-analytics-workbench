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
  /**
   * Limits the height: the bordered region itself scrolls vertically, so its frame stays in place,
   * and the column headers stay in view (TASK-004 DEC-004).
   */
  maxHeight?: "sm" | "md";
  /** Tighter rows and a smaller caption, to show more rows (TASK-004 DEC-004). */
  dense?: boolean;
  /** Keeps the caption for assistive technology only, when a visible title already names it. */
  hideCaption?: boolean;
}

export function Table<Row>({
  caption,
  columns,
  rows,
  rowKey,
  emptyMessage = "No data to show.",
  className,
  maxHeight,
  dense = false,
  hideCaption = false,
}: TableProps<Row>) {
  const pad = dense ? "px-3 py-1" : "px-4 py-2";
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
        maxHeight && "overflow-y-auto",
        maxHeight === "sm" && "max-h-64",
        maxHeight === "md" && "max-h-[28rem]",
        className,
      )}
    >
      <table className="w-full border-collapse text-body-sm text-fg">
        <caption
          id={captionId}
          className={cn(
            "text-left text-fg",
            dense ? "px-3 py-1.5 text-caption" : "px-4 py-3 text-label",
            hideCaption && "sr-only",
          )}
        >
          {caption}
        </caption>
        <thead className="bg-surface-muted">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  "border-b border-border font-semibold whitespace-nowrap text-fg-secondary",
                  pad,
                  // Sticky headers need their own background; the inset shadow keeps the divider
                  // visible, since a collapsed border does not stick with the cell.
                  maxHeight &&
                    "sticky top-0 z-10 bg-surface-muted shadow-[inset_0_-1px_0_var(--color-border)]",
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
              <tr
                key={rowKey(row)}
                className="border-b border-border transition-colors last:border-b-0 hover:bg-surface-muted"
              >
                {columns.map((column) => {
                  const value = row[column.key];
                  const content = column.format ? column.format(value, row) : String(value ?? "");
                  const cellClass = cn(pad, "whitespace-nowrap", align(column));
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
