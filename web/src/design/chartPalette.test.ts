import {
  type Color,
  converter,
  differenceCiede2000,
  filterDeficiencyDeuter,
  filterDeficiencyProt,
  filterDeficiencyTrit,
  parse,
} from "culori";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";
import { chartPalettes, colors } from "./tokens";

const deltaE = differenceCiede2000();
const toOklch = converter("oklch");
const SIMULATIONS: [string, (c: Color) => Color][] = [
  ["normal vision", (c) => c],
  ["protanopia", filterDeficiencyProt(1)],
  ["deuteranopia", filterDeficiencyDeuter(1)],
  ["tritanopia", filterDeficiencyTrit(1)],
];

function color(hex: string): Color {
  const parsed = parse(hex);
  if (!parsed) throw new Error(`Unparseable color ${hex}`);
  return parsed;
}

function minPairDifference(hexes: string[], simulate: (c: Color) => Color) {
  let min = Infinity;
  let pair = "";
  hexes.forEach((a, i) =>
    hexes.slice(i + 1).forEach((b) => {
      const d = deltaE(simulate(color(a)), simulate(color(b)));
      if (d < min) [min, pair] = [d, `${a} vs ${b}`];
    }),
  );
  return { min, pair };
}

const lightness = (hex: string) => toOklch(color(hex)).l;

describe("categorical chart palette (AC-8)", () => {
  const { categorical } = chartPalettes;
  const background = colors.surface ?? "";

  it("has six colors", () => {
    expect(categorical).toHaveLength(6);
  });

  it.each(categorical)("%s is at least 3:1 against the chart background", (hex) => {
    expect(contrastRatio(hex, background)).toBeGreaterThanOrEqual(3);
  });

  // The theme background is transparent, so charts may sit on the page canvas too (F9).
  it.each(categorical)("%s is at least 3:1 against the page canvas", (hex) => {
    expect(contrastRatio(hex, colors.canvas ?? "")).toBeGreaterThanOrEqual(3);
  });

  it.each(SIMULATIONS)("keeps every pair distinguishable under %s", (name, simulate) => {
    const required = name === "normal vision" ? 15 : 8;
    const { min, pair } = minPairDifference(categorical, simulate);
    expect(min, `closest pair ${pair}`).toBeGreaterThanOrEqual(required);
  });
});

describe("sequential chart palette (AC-8)", () => {
  it("has five steps with strictly decreasing lightness (light to dark)", () => {
    const steps = chartPalettes.sequential.map(lightness);
    expect(steps).toHaveLength(5);
    steps.slice(1).forEach((l, i) => expect(l).toBeLessThan(steps[i] ?? 0));
  });
});

describe("diverging chart palette (AC-8)", () => {
  const { diverging } = chartPalettes;

  it("has five steps around a neutral midpoint", () => {
    expect(diverging).toHaveLength(5);
    expect(toOklch(color(diverging[2] ?? "")).c).toBeLessThan(0.02);
  });

  it("gets darker from the midpoint toward both ends", () => {
    const l = diverging.map(lightness);
    expect(l[0]).toBeLessThan(l[1] ?? 0);
    expect(l[1]).toBeLessThan(l[2] ?? 0);
    expect(l[4]).toBeLessThan(l[3] ?? 0);
    expect(l[3]).toBeLessThan(l[2] ?? 0);
  });

  it("uses clearly different hues on each side", () => {
    const hue = (hex: string) => toOklch(color(hex)).h ?? 0;
    const gap = Math.abs(hue(diverging[0] ?? "") - hue(diverging[4] ?? ""));
    expect(Math.min(gap, 360 - gap)).toBeGreaterThan(90);
  });
});
