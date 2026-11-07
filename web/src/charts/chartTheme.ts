import { chartPalettes, colors, themeVariables } from "../design/tokens";

function token(name: string): string {
  const value = colors[name];
  if (!value) throw new Error(`Missing color token --color-${name}`);
  return value;
}

export const CHART_THEME_NAME = "cawb";

function axis() {
  return {
    axisLine: { show: true, lineStyle: { color: token("border-input") } },
    axisTick: { show: false },
    axisLabel: { color: token("fg-muted") },
    splitLine: { show: true, lineStyle: { color: token("border") } },
  };
}

/** ECharts theme built only from design tokens (registered by ChartWithTable). */
export const chartTheme = {
  color: chartPalettes.categorical,
  backgroundColor: "transparent",
  textStyle: {
    fontFamily: themeVariables["font-sans"] ?? "sans-serif",
    color: token("fg-secondary"),
  },
  legend: { textStyle: { color: token("fg-secondary") } },
  tooltip: {
    backgroundColor: token("surface"),
    borderColor: token("border"),
    textStyle: { color: token("fg") },
  },
  categoryAxis: axis(),
  valueAxis: axis(),
};
