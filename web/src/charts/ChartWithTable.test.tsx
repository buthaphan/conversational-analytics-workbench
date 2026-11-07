import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "../test/axe";
import { ChartWithTable, type ChartSeries } from "./ChartWithTable";

// ECharts needs a real canvas and layout; the simulated DOM checks the options we pass instead.
vi.mock("echarts-for-react", () => ({
  default: (props: { option: unknown; theme: string }) => (
    <div
      data-testid="echarts"
      data-theme={props.theme}
      data-option={JSON.stringify(props.option)}
    />
  ),
}));

const categories = ["Jan", "Feb", "Mar"];
const series: ChartSeries[] = [
  { name: "Revenue", values: [1200.5, 980, 1430.25] },
  { name: "Orders", values: [31, 27, 40] },
];
const format = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });

function renderChart(props: Partial<Parameters<typeof ChartWithTable>[0]> = {}) {
  return render(
    <ChartWithTable
      title="Monthly sales"
      categoryLabel="Month"
      categories={categories}
      series={series}
      formatValue={format}
      {...props}
    />,
  );
}

function chartOption() {
  return JSON.parse(screen.getByTestId("echarts").getAttribute("data-option") ?? "{}");
}

describe("ChartWithTable (AC-8)", () => {
  it("renders the chart with the project theme", () => {
    renderChart();
    expect(screen.getByTestId("echarts")).toHaveAttribute("data-theme", "cawb");
  });

  it("passes the same categories and values to the chart", () => {
    renderChart();
    const option = chartOption();
    expect(option.xAxis.data).toEqual(categories);
    expect(option.series.map((s: { name: string }) => s.name)).toEqual(["Revenue", "Orders"]);
    expect(option.series[0].data).toEqual([1200.5, 980, 1430.25]);
  });

  it("shows series names as legend text so color is not the only cue", () => {
    renderChart();
    expect(chartOption().legend.show).toBe(true);
  });

  it("labels the chart image and points to the table", () => {
    renderChart();
    const figure = screen.getByRole("figure", { name: "Monthly sales" });
    expect(
      within(figure).getByRole("img", { name: /Monthly sales.*table below/i }),
    ).toBeInTheDocument();
  });

  it("renders a table with exactly the charted values", () => {
    renderChart();
    const table = screen.getByRole("table", { name: "Monthly sales" });
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((h) => h.textContent);
    expect(headers).toEqual(["Month", "Revenue", "Orders"]);
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((r) => r.textContent)).toEqual(["Jan1,200.531", "Feb98027", "Mar1,430.2540"]);
  });

  it("shows an empty state and no chart when there is no data", () => {
    renderChart({ categories: [], series: [{ name: "Revenue", values: [] }] });
    expect(screen.queryByTestId("echarts")).not.toBeInTheDocument();
    expect(screen.getByText("No data to chart.")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "No data to show." })).toBeInTheDocument();
  });

  it("keeps rows distinct when two categories share a label (F7)", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    renderChart({
      categories: ["Unknown", "Unknown"],
      series: [{ name: "Revenue", values: [10, 20] }],
    });
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows.map((r) => r.textContent)).toEqual(["Unknown10", "Unknown20"]);
    const keyWarnings = error.mock.calls.filter((args) => String(args[0]).includes("same key"));
    expect(keyWarnings).toEqual([]);
    error.mockRestore();
  });

  it("rejects series whose length does not match the categories", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderChart({ series: [{ name: "Revenue", values: [1, 2] }] })).toThrow(/length/i);
  });

  it("has no axe violations", async () => {
    const { container } = renderChart();
    await expectNoAxeViolations(container);
  });
});
