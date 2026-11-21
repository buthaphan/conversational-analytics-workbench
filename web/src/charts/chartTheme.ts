import { chartPalettes, colors, themeVariables } from "../design/tokens";

function token(name: string): string {
  const value = colors[name];
  if (!value) throw new Error(`Missing color token --color-${name}`);
  return value;
}

export const CHART_THEME_NAME = "cawb";

/** Chart text uses the caption size (ECharts needs pixels; the token is in rem at 16px). */
const FONT_SIZE = Math.round(parseFloat(themeVariables["text-caption"] ?? "0.6875") * 16);

function axis() {
  return {
    axisLine: { show: true, lineStyle: { color: token("border-input") } },
    axisTick: { show: false },
    axisLabel: { color: token("fg-muted"), fontSize: FONT_SIZE },
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
    fontSize: FONT_SIZE,
  },
  legend: { textStyle: { color: token("fg-secondary"), fontSize: FONT_SIZE } },
  tooltip: {
    backgroundColor: token("surface"),
    borderColor: token("border"),
    textStyle: { color: token("fg"), fontSize: FONT_SIZE },
  },
  categoryAxis: axis(),
  valueAxis: axis(),
  // Series styling (no colors: those come from the palette). Lines carry hollow point markers;
  // vertical bars have rounded tops; pie slices are separated by the surface color.
  line: { symbol: "emptyCircle", symbolSize: 7, lineStyle: { width: 2.5 } },
  bar: { barMaxWidth: 36, itemStyle: { borderRadius: [4, 4, 0, 0] } },
  pie: { itemStyle: { borderColor: token("surface"), borderWidth: 2 } },
};
