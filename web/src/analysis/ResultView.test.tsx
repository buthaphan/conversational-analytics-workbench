import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "../test/axe";
import { AnalysisCardView } from "./AnalysisCardView";
import type { ActiveResult, GroupedView, SeriesBucket, SeriesView } from "./api";
import { ResultArea, ScopeSummary } from "./ResultView";

vi.mock("echarts-for-react", () => ({
  default: (props: { option: unknown }) => (
    <div data-testid="echarts" data-option={JSON.stringify(props.option)} />
  ),
}));
vi.mock("echarts", () => ({ registerTheme: () => {} }));

const option = () => JSON.parse(screen.getByTestId("echarts").getAttribute("data-option") ?? "{}");
const rowTexts = (table: HTMLElement) =>
  within(table)
    .getAllByRole("row")
    .slice(1)
    .map((r) => r.textContent);

const y2025 = { start_date: "2025-01-01", end_date: "2026-01-01" };

// ---- Entity rows ---------------------------------------------------------------------------------

const customers: ActiveResult = {
  capability: "customer_spending",
  title: "Customer spending",
  rowNoun: ["customer", "customers"],
  scope: y2025,
  fields: [
    { name: "customer_id", label: "Customer ID", kind: "id" },
    { name: "customer_name", label: "Customer", kind: "label" },
    { name: "total_spend", label: "Total spend", kind: "money" },
  ],
  rowCount: 2,
  filteredCount: 2,
  rows: [
    { customer_id: "C1", customer_name: "Ada Park", total_spend: 300 },
    { customer_id: "C2", customer_name: "Ben Ruiz", total_spend: 100 },
  ],
  view: {
    filters: [],
    sort: { field: "total_spend", direction: "desc" },
    limit: 10,
    view: "horizontal_bar",
  },
};

describe("result area: entity rows (TASK-005 AC-11)", () => {
  it("draws horizontal bars with the same table", async () => {
    const { container } = render(<ResultArea result={customers} />);
    expect(option().yAxis).toMatchObject({ type: "category", data: ["Ada Park", "Ben Ruiz"] });
    expect(rowTexts(screen.getByRole("table"))).toEqual(["Ada Park$300.00", "Ben Ruiz$100.00"]);
    await expectNoAxeViolations(container);
  });
});

// ---- Time series -----------------------------------------------------------------------------------

const bucket = (
  label: string,
  firstDay: string,
  lastDay: string,
  revenue: number,
  partial = false,
): SeriesBucket => ({
  label,
  firstDay,
  lastDay,
  partial,
  revenue,
  order_count: 1,
  item_count: 2,
});

const seriesFields = [
  { name: "date", label: "Date", kind: "label" as const },
  { name: "revenue", label: "Revenue", kind: "money" as const },
  { name: "order_count", label: "Orders", kind: "integer" as const },
  { name: "item_count", label: "Items sold", kind: "integer" as const },
];

const thisYear = { start_date: "2026-10-01", end_date: "2027-01-01" };
const single: SeriesView = {
  interval: "month",
  measure: "revenue",
  main: [
    bucket("Oct 2026", "2026-10-01", "2026-10-31", 120),
    bucket("Nov 2026", "2026-11-01", "2026-11-08", 30, true),
  ],
  lengthsDiffer: false,
  totals: { main: { revenue: 150, order_count: 2, item_count: 4 } },
};

const seriesResult = (series: SeriesView, extra: Partial<ActiveResult> = {}): ActiveResult => ({
  capability: "sales_time_series",
  title: "Sales over time",
  rowNoun: ["day", "days"],
  scope: thisYear,
  fields: seriesFields,
  rowCount: 39,
  filteredCount: 39,
  rows: [],
  view: {
    filters: [],
    sort: { field: "revenue", direction: "desc" },
    limit: 10,
    view: "line",
    interval: series.interval,
    measure: series.measure,
  },
  parameters: {},
  series,
  ...extra,
});

const compared: SeriesView = {
  interval: "month",
  measure: "revenue",
  main: [
    bucket("Jan 2025", "2025-01-01", "2025-01-31", 150),
    bucket("Feb 2025", "2025-02-01", "2025-02-28", 20),
  ],
  comparison: [bucket("Jan 2024", "2024-01-01", "2024-01-31", 100)],
  lengthsDiffer: true,
  totals: {
    main: { revenue: 170, order_count: 2, item_count: 4 },
    comparison: { revenue: 100, order_count: 4, item_count: 0 },
    change: {
      revenue: { amount: 70, percent: 0.7 },
      order_count: { amount: -2, percent: -0.5 },
      item_count: { amount: 4, percent: null },
    },
  },
};
const comparedResult = seriesResult(compared, {
  scope: { start_date: "2025-01-01", end_date: "2025-03-01" },
  parameters: {
    product_filter: { field: "category", values: ["Jeans"] },
    comparison: { baseline: "previous_year" },
  },
  comparisonScope: { start_date: "2024-01-01", end_date: "2024-03-01" },
});

describe("result area: sales over time (TASK-005 AC-11)", () => {
  it("draws one line by the interval, marking partial buckets and listing each bucket's dates", async () => {
    const { container } = render(<ResultArea result={seriesResult(single)} />);
    expect(screen.getByRole("figure", { name: "Revenue by month" })).toBeInTheDocument();
    const chart = option();
    expect(chart.xAxis.data).toEqual(["Oct 2026", "Nov 2026 (partial)"]);
    expect(chart.series).toMatchObject([{ name: "Revenue", type: "line", data: [120, 30] }]);
    const table = screen.getByRole("table", { name: "Revenue by month" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(["Month", "Revenue", "Dates"]);
    expect(rowTexts(table)).toEqual([
      "Oct 2026$120.001–31 Oct 2026",
      "Nov 2026 (partial)$30.001–8 Nov 2026",
    ]);
    expect(screen.queryByRole("table", { name: /period totals/i })).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("draws bars or only the table when the view says so", () => {
    const { unmount } = render(
      <ResultArea
        result={{ ...seriesResult(single), view: { ...seriesResult(single).view, view: "bar" } }}
      />,
    );
    expect(option().series[0].type).toBe("bar");
    unmount();
    render(
      <ResultArea
        result={{ ...seriesResult(single), view: { ...seriesResult(single).view, view: "table" } }}
      />,
    );
    expect(screen.queryByTestId("echarts")).not.toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Revenue by month" })).toBeInTheDocument();
  });

  it("draws two lines named by their periods, aligned by bucket, with gaps where a period is shorter", async () => {
    const { container } = render(<ResultArea result={comparedResult} />);
    const chart = option();
    // Compact period names and dates keep the table narrow (walkthrough W3).
    expect(chart.series.map((s: { name: string }) => s.name)).toEqual([
      "Jan – Feb 2025",
      "Jan – Feb 2024",
    ]);
    expect(chart.series[1].data).toEqual([100, null]);
    const table = screen.getByRole("table", { name: "Revenue by month" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(["Month", "Jan – Feb 2025", "Jan – Feb 2024", "Dates", "Compared dates", "Change"]);
    expect(rowTexts(table)).toEqual([
      "Jan 2025$150.00$100.001–31 Jan 20251–31 Jan 2024+$50.00",
      "Feb 2025$20.001–28 Feb 2025",
    ]);
    await expectNoAxeViolations(container);
  });

  it("shows the period totals under a compared series, with the change and % change", () => {
    render(<ResultArea result={comparedResult} />);
    const totals = screen.getByRole("table", { name: "Period totals" });
    expect(
      within(totals)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(["Measure", "Jan – Feb 2025", "Jan – Feb 2024", "Change", "% change"]);
    expect(rowTexts(totals)).toEqual([
      "Revenue$170.00$100.00+$70.00+70.0%",
      "Orders24−2−50.0%",
      "Items sold40+4None (from zero)",
    ]);
  });

  it("summarizes the series' scope: interval, measure, product filter, and comparison", async () => {
    const { container } = render(<ScopeSummary result={comparedResult} />);
    const summary = screen.getByRole("region", { name: "Sales over time" });
    expect(summary).toHaveTextContent("Period1 Jan 2025 – 28 Feb 2025");
    expect(summary).toHaveTextContent("IntervalBy month");
    expect(summary).toHaveTextContent("MeasureRevenue");
    expect(summary).toHaveTextContent("ProductsCategory: Jeans");
    expect(summary).toHaveTextContent("Compared with1 Jan 2024 – 29 Feb 2024 (previous year)");
    await expectNoAxeViolations(container);
  });

  it("says when a series has no product filter or comparison", () => {
    render(<ScopeSummary result={seriesResult(single)} />);
    const summary = screen.getByRole("region", { name: "Sales over time" });
    expect(summary).toHaveTextContent("ProductsAll products");
    expect(summary).toHaveTextContent("Compared withNo comparison");
  });
});

// ---- Grouped product results -----------------------------------------------------------------------

const productFields = [
  { name: "product_id", label: "Product ID", kind: "id" as const },
  { name: "product_name", label: "Product", kind: "label" as const },
  { name: "category", label: "Category", kind: "category" as const },
  { name: "brand", label: "Brand", kind: "category" as const },
  { name: "revenue", label: "Revenue", kind: "money" as const },
  { name: "item_count", label: "Items sold", kind: "integer" as const },
];
const group = (key: string, revenue: number, products = 1) => ({
  key,
  product_count: products,
  revenue,
  item_count: products * 2,
});

const brands: GroupedView = {
  groupBy: "brand",
  groupCount: 7,
  rowCount: 9,
  filteredCount: 9,
  groups: [group("Northline", 300), group("Saltmarsh", 200)],
  other: { ...group("Other", 500, 5), key: "Other", groups: 5 },
};
const groupedResult = (grouped: GroupedView, view: ActiveResult["view"]["view"]): ActiveResult => ({
  capability: "product_sales_performance",
  title: "Product sales performance",
  rowNoun: ["product", "products"],
  scope: y2025,
  fields: productFields,
  rowCount: 9,
  filteredCount: 9,
  rows: [],
  view: {
    filters: [],
    sort: { field: "revenue", direction: "desc" },
    limit: 10,
    view,
    group_by: grouped.groupBy,
    ...(grouped.groupBy === "brand" ? { groupLimit: 2 } : {}),
  },
  grouped,
});

describe("result area: grouped products (TASK-005 AC-11, DEC-001)", () => {
  it('lists "Other" in the table but does not draw it, and says so under the chart', async () => {
    const { container } = render(<ResultArea result={groupedResult(brands, "bar")} />);
    expect(
      screen.getByRole("figure", { name: "Revenue by brand (highest first)" }),
    ).toBeInTheDocument();
    expect(option().xAxis.data).toEqual(["Northline", "Saltmarsh"]);
    const table = screen.getByRole("table", { name: "Revenue by brand (highest first)" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(["Brand", "Revenue", "Products", "Items sold"]);
    expect(rowTexts(table)).toEqual([
      "Northline$300.0012",
      "Saltmarsh$200.0012",
      "Other (5 brands)$500.00510",
    ]);
    expect(
      screen.getByText(
        '"Other" (5 brands, 50.0% of revenue) is listed in the table but not drawn, so the other bars stay readable.',
      ),
    ).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("does the same for horizontal bars", () => {
    render(<ResultArea result={groupedResult(brands, "horizontal_bar")} />);
    expect(option().yAxis.data).toEqual(["Northline", "Saltmarsh"]);
    expect(screen.getByText(/is listed in the table but not drawn/)).toBeInTheDocument();
  });

  it('shows the grouped table alone, with "Other" and no note', () => {
    render(<ResultArea result={groupedResult(brands, "table")} />);
    expect(screen.queryByTestId("echarts")).not.toBeInTheDocument();
    expect(rowTexts(screen.getByRole("table"))).toHaveLength(3);
    expect(screen.queryByText(/not drawn/)).not.toBeInTheDocument();
  });

  it("draws a pie of the slices with their value and share, and lists every group below", async () => {
    const categories: GroupedView = {
      groupBy: "category",
      groupCount: 7,
      rowCount: 7,
      filteredCount: 7,
      groups: ["A", "B", "C", "D", "E", "F", "G"].map((k, i) => group(k, 70 - i * 10)),
      other: null,
      pie: {
        measure: "revenue",
        slices: ["A", "B", "C", "D", "E"].map((k, i) => ({
          ...group(k, 70 - i * 10),
          share: (70 - i * 10) / 280,
        })),
        other: { ...group("Other", 30, 2), key: "Other", groups: 2, share: 30 / 280 },
      },
    };
    const { container } = render(<ResultArea result={groupedResult(categories, "pie")} />);
    const chart = option();
    expect(chart.series[0].type).toBe("pie");
    expect(chart.series[0].data.map((d: { name: string }) => d.name)).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
      "Other (2 categories)",
    ]);
    const slices = screen.getByRole("table", { name: "Revenue by category (pie)" });
    expect(rowTexts(slices)[0]).toBe("A$70.0025.0%");
    expect(rowTexts(slices).at(-1)).toBe("Other (2 categories)$30.0010.7%");
    const all = screen.getByRole("table", { name: "All categories" });
    expect(rowTexts(all)).toHaveLength(7);
    // Both tables share the card's height on wide screens: each keeps a minimum and scrolls, so
    // neither is squeezed to nothing (walkthrough, pie view).
    for (const name of ["Revenue by category (pie)", "All categories"]) {
      expect(screen.getByRole("region", { name }).className).toMatch(/(^|\s)lg:min-h-40(\s|$)/);
    }
    await expectNoAxeViolations(container);
  });

  it('names the table under a brand pie for what it lists: the top brands and "Other" (DEC-004)', () => {
    const slice = (key: string, revenue: number) => ({ ...group(key, revenue), share: 0.1 });
    render(
      <ResultArea
        result={groupedResult(
          {
            ...brands,
            pie: {
              measure: "revenue",
              slices: [slice("Northline", 300), slice("Saltmarsh", 200)],
              other: { ...slice("Other", 500), key: "Other", groups: 5 },
            },
          },
          "pie",
        )}
      />,
    );
    const table = screen.getByRole("table", { name: 'Brands: top 2 and "Other"' });
    expect(rowTexts(table)).toHaveLength(3);
    expect(screen.queryByRole("table", { name: "All brands" })).not.toBeInTheDocument();
  });

  it("states the grouping in the scope summary", () => {
    render(<ScopeSummary result={groupedResult(brands, "bar")} />);
    const summary = screen.getByRole("region", { name: "Product sales performance" });
    expect(summary).toHaveTextContent("GroupingBy brand: top 2 of 7 brands, the rest as Other");
    expect(summary).toHaveTextContent("Showing3 groups, by revenue (highest first)");
  });
});

describe("analysis card: series summary (TASK-005 AC-7, AC-11)", () => {
  it("names the lowest and highest bucket with their values", async () => {
    const { container } = render(
      <AnalysisCardView
        card={{
          operation: "summary",
          target: "complete",
          baseCount: 12,
          field: "revenue",
          count: 12,
          total: 120,
          average: 10,
          median: 9.5,
          min: 2,
          max: 30,
          buckets: { interval: "month", lowest: "Feb 2025", highest: "Dec 2025" },
          rowNoun: ["month", "months"],
          fields: seriesFields,
        }}
      />,
    );
    const table = screen.getByRole("table", { name: "Summary of revenue" });
    expect(rowTexts(table)).toEqual([
      "Based onAll 12 months",
      "Total$120.00",
      "Average$10.00",
      "Median$9.50",
      "Lowest$2.00 (Feb 2025)",
      "Highest$30.00 (Dec 2025)",
    ]);
    await expectNoAxeViolations(container);
  });
});
