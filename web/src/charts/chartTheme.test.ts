import { describe, expect, it } from "vitest";
import { contrastRatio } from "../design/contrast";
import { chartPalettes, colors } from "../design/tokens";
import { CHART_THEME_NAME, chartTheme } from "./chartTheme";

describe("ECharts theme (AC-8)", () => {
  it("has a stable name", () => {
    expect(CHART_THEME_NAME).toBe("cawb");
  });

  it("uses the categorical palette for series", () => {
    expect(chartTheme.color).toEqual(chartPalettes.categorical);
  });

  it("uses the token font stack", () => {
    expect(chartTheme.textStyle.fontFamily).toMatch(/^"Inter Variable"/);
  });

  it("sizes all chart text at the caption token, 12px (TASK-004 DEC-004)", () => {
    expect(chartTheme.textStyle.fontSize).toBe(12);
    expect(chartTheme.legend.textStyle.fontSize).toBe(12);
    expect(chartTheme.tooltip.textStyle.fontSize).toBe(12);
    expect(chartTheme.categoryAxis.axisLabel.fontSize).toBe(12);
    expect(chartTheme.valueAxis.axisLabel.fontSize).toBe(12);
  });

  it("takes every color from the tokens", () => {
    const tokenValues = new Set(Object.values(colors));
    const used = [
      chartTheme.textStyle.color,
      chartTheme.tooltip.backgroundColor,
      chartTheme.tooltip.borderColor,
      chartTheme.tooltip.textStyle.color,
      ...["categoryAxis", "valueAxis"].flatMap((axis) => {
        const a = chartTheme[axis as "categoryAxis" | "valueAxis"];
        return [a.axisLine.lineStyle.color, a.axisLabel.color, a.splitLine.lineStyle.color];
      }),
      chartTheme.legend.textStyle.color,
    ];
    used.forEach((c) => expect(tokenValues.has(c), c).toBe(true));
  });

  it("keeps tooltip, legend, and axis label text at 4.5:1 or better", () => {
    const surface = colors.surface ?? "";
    expect(
      contrastRatio(chartTheme.tooltip.textStyle.color, chartTheme.tooltip.backgroundColor),
    ).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(chartTheme.legend.textStyle.color, surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(chartTheme.categoryAxis.axisLabel.color, surface)).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(contrastRatio(chartTheme.valueAxis.axisLabel.color, surface)).toBeGreaterThanOrEqual(
      4.5,
    );
  });
});
