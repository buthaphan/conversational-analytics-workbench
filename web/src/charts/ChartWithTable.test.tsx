import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "../test/axe";
import { ChartWithTable, type ChartSeries } from "./ChartWithTable";

// ECharts needs a real canvas and layout; the simulated DOM checks the options we pass instead.
vi.mock("echarts-for-react", () => ({
  default: (props: { option: unknown; theme: string; notMerge?: boolean }) => (
    <div
      data-testid="echarts"
      data-theme={props.theme}
      data-not-merge={String(props.notMerge ?? false)}
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

  it("replaces the chart's options rather than merging them, so a pie keeps no bar axes", () => {
    renderChart();
    expect(screen.getByTestId("echarts")).toHaveAttribute("data-not-merge", "true");
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

  describe("chart types (TASK-005 AC-11)", () => {
    const one: ChartSeries[] = [{ name: "Revenue", values: [30, 20, 10] }];

    it("draws horizontal bars with categories on the vertical axis, first at the top", async () => {
      const { container } = renderChart({ type: "horizontal_bar", series: one });
      const option = chartOption();
      expect(option.yAxis).toMatchObject({ type: "category", data: categories, inverse: true });
      expect(option.xAxis).toMatchObject({ type: "value" });
      expect(option.series[0].type).toBe("bar");
      await expectNoAxeViolations(container);
    });

    it("labels every horizontal bar and grows the chart with the number of bars (walkthrough W4)", () => {
      const brands = Array.from({ length: 20 }, (_, i) => `Brand ${i + 1}`);
      renderChart({
        type: "horizontal_bar",
        compact: true,
        categories: brands,
        series: [{ name: "Revenue", values: brands.map((_, i) => 100 - i) }],
      });
      expect(chartOption().yAxis.axisLabel).toMatchObject({ interval: 0 });
      // 1rem per bar plus room for the legend and axis; never below the usual 14rem.
      expect(screen.getByRole("img", { name: /chart\. Exact values/ }).style.minHeight).toBe(
        "24rem",
      );
    });

    it("keeps the usual minimum height for a few horizontal bars", () => {
      renderChart({
        type: "horizontal_bar",
        compact: true,
        series: [{ name: "R", values: [3, 2, 1] }],
      });
      expect(screen.getByRole("img", { name: /chart\. Exact values/ }).style.minHeight).toBe(
        "14rem",
      );
    });

    it("draws a pie with a text label on every slice, from the theme's palette", async () => {
      const { container } = renderChart({ type: "pie", series: one });
      const option = chartOption();
      expect(option.xAxis).toBeUndefined();
      expect(option.series).toHaveLength(1);
      expect(option.series[0]).toMatchObject({
        type: "pie",
        data: [
          { name: "Jan", value: 30 },
          { name: "Feb", value: 20 },
          { name: "Mar", value: 10 },
        ],
        label: { show: true },
      });
      // Colors come from the registered theme, never from raw values in the option.
      expect(JSON.stringify(option)).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/i);
      await expectNoAxeViolations(container);
    });

    it("draws lines that leave a gap where a series has no value", () => {
      renderChart({
        type: "line",
        series: [
          { name: "2025", values: [1, 2, 3] },
          { name: "2024", values: [4, 5, null] },
        ],
      });
      const option = chartOption();
      expect(option.series[1]).toMatchObject({ type: "line", data: [4, 5, null] });
      const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
      expect(rows.map((r) => r.textContent)).toEqual(["Jan14", "Feb25", "Mar3"]);
    });

    it("shows only the table for the table view", async () => {
      const { container } = renderChart({ type: "table" });
      expect(screen.queryByTestId("echarts")).not.toBeInTheDocument();
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
      expect(screen.getByRole("table", { name: "Monthly sales" })).toBeInTheDocument();
      await expectNoAxeViolations(container);
    });

    it("adds preformatted columns to the table only", () => {
      renderChart({
        series: one,
        extraColumns: [{ header: "Share", values: ["50.0%", "33.3%", "16.7%"] }],
      });
      const table = screen.getByRole("table");
      expect(
        within(table)
          .getAllByRole("columnheader")
          .map((h) => h.textContent),
      ).toEqual(["Month", "Revenue", "Share"]);
      expect(within(table).getByRole("cell", { name: "33.3%" })).toBeInTheDocument();
      expect(chartOption().series).toHaveLength(1);
    });

    it("lists table-only rows in the table but not in the chart, with a note", async () => {
      const { container } = renderChart({
        series: one,
        extraColumns: [{ header: "Products", values: ["1", "2", "3"] }],
        tableOnlyRows: [{ category: "Other (5 brands)", values: [99], extra: ["40"] }],
        note: "Other is listed in the table but not drawn.",
      });
      expect(chartOption().xAxis.data).toEqual(categories);
      const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
      expect(rows.at(-1)?.textContent).toBe("Other (5 brands)9940");
      expect(screen.getByText("Other is listed in the table but not drawn.")).toBeInTheDocument();
      await expectNoAxeViolations(container);
    });
  });

  describe("compact (TASK-004 DEC-004)", () => {
    it("keeps the full table in its own vertically scrolling region with a shorter chart", async () => {
      const { container } = renderChart({ compact: true });
      const region = screen.getByRole("region", { name: "Monthly sales" });
      expect(region).toHaveAttribute("tabindex", "0");
      expect(region.className).toMatch(/(^|\s)overflow-y-auto(\s|$)/);
      expect(within(region).getAllByRole("row")).toHaveLength(categories.length + 1);
      expect(screen.getAllByRole("region")).toHaveLength(1);
      expect(screen.getByRole("img", { name: /Monthly sales chart/ }).className).not.toContain(
        "h-80",
      );
      await expectNoAxeViolations(container);
    });

    it("does not limit the table height by default", () => {
      renderChart();
      expect(screen.getByRole("region", { name: "Monthly sales" }).className).not.toMatch(
        /overflow-y-auto/,
      );
    });
  });
});
