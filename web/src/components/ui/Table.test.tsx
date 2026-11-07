import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "../../test/axe";
import { Table, type TableColumn } from "./Table";

interface Row {
  id: string;
  customer: string;
  spend: number;
  orders: number;
}

const columns: TableColumn<Row>[] = [
  { key: "customer", header: "Customer", rowHeader: true },
  { key: "spend", header: "Total spend", numeric: true, format: (v) => `$${Number(v).toFixed(2)}` },
  { key: "orders", header: "Orders", numeric: true },
];

const rows: Row[] = [
  { id: "1", customer: "Customer A", spend: 1234.5, orders: 7 },
  { id: "2", customer: "Customer B", spend: 99, orders: 2 },
];

function renderTable(data: Row[] = rows) {
  return render(
    <Table caption="Top customers" columns={columns} rows={data} rowKey={(r) => r.id} />,
  );
}

describe("Table (AC-7)", () => {
  it("has a caption and column headers with scope", () => {
    renderTable();
    const table = screen.getByRole("table", { name: "Top customers" });
    const headers = within(table).getAllByRole("columnheader");
    expect(headers.map((h) => h.textContent)).toEqual(["Customer", "Total spend", "Orders"]);
    headers.forEach((h) => expect(h).toHaveAttribute("scope", "col"));
  });

  it("uses a row header with scope=row for the identifying column", () => {
    renderTable();
    const rowHeader = screen.getByRole("rowheader", { name: "Customer A" });
    expect(rowHeader).toHaveAttribute("scope", "row");
  });

  it("formats values and right-aligns numeric columns with tabular figures", () => {
    renderTable();
    const cell = screen.getByRole("cell", { name: "$1234.50" });
    expect(cell.className).toMatch(/(^|\s)text-right(\s|$)/);
    expect(cell.className).toMatch(/(^|\s)tabular-nums(\s|$)/);
    const header = screen.getByRole("columnheader", { name: "Orders" });
    expect(header.className).toMatch(/(^|\s)text-right(\s|$)/);
  });

  it("scrolls horizontally inside a labelled, keyboard-focusable container", () => {
    renderTable();
    const region = screen.getByRole("region", { name: "Top customers" });
    expect(region.className).toMatch(/(^|\s)overflow-x-auto(\s|$)/);
    expect(region).toHaveAttribute("tabindex", "0");
    expect(within(region).getByRole("table")).toBeInTheDocument();
  });

  it("shows an empty-state row when there is no data", () => {
    renderTable([]);
    expect(screen.getByRole("cell", { name: "No data to show." })).toHaveAttribute("colspan", "3");
  });

  it("has no axe violations, with and without data", async () => {
    const { container, unmount } = renderTable();
    await expectNoAxeViolations(container);
    unmount();
    const empty = renderTable([]);
    await expectNoAxeViolations(empty.container);
  });
});
