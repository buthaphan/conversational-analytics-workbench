import tokensCss from "../styles/tokens.css?raw";
import { contrastRatio } from "./contrast";

export type ColorTokens = Record<string, string>;

const COLOR_DECLARATION = /--color-([a-z0-9-]+)\s*:\s*(#[0-9a-f]{3,8})\s*;/gi;

/** Removes CSS comments so commented-out declarations are not parsed. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Reads `--color-name: #hex;` declarations from CSS. */
export function parseColorTokens(css: string): ColorTokens {
  const tokens: ColorTokens = {};
  for (const [, name, value] of stripComments(css).matchAll(COLOR_DECLARATION)) {
    if (!name || !value) continue;
    if (name in tokens) {
      throw new Error(`Duplicate color token: --color-${name}`);
    }
    tokens[name] = value;
  }
  return tokens;
}

/** Color token values, read from the same file Tailwind compiles. */
export const colors: ColorTokens = parseColorTokens(tokensCss);

const VARIABLE_DECLARATION = /--([a-z0-9-]+)\s*:\s*([^;]+);/gi;

/** All custom properties in the token source (first declaration wins), with whitespace collapsed. */
export function parseThemeVariables(css: string): Record<string, string> {
  const variables: Record<string, string> = {};
  for (const [, name, value] of stripComments(css).matchAll(VARIABLE_DECLARATION)) {
    if (!name || !value || name in variables) continue;
    variables[name] = value.replace(/\s+/g, " ").trim();
  }
  return variables;
}

export const themeVariables: Record<string, string> = parseThemeVariables(tokensCss);

function series(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const value = colors[`${prefix}-${i + 1}`];
    if (!value) throw new Error(`Missing color token --color-${prefix}-${i + 1}`);
    return value;
  });
}

/** Chart palettes, read from the token source. */
export const chartPalettes = {
  categorical: series("chart", 6),
  sequential: series("seq", 5),
  diverging: series("div", 5),
};

export const REQUIRED_COLOR_ROLES = [
  "brand-navy",
  "brand-teal",
  "brand-gold",
  "canvas",
  "surface",
  "surface-muted",
  "fg",
  "fg-secondary",
  "fg-muted",
  "accent",
  "border",
  "border-input",
  "focus",
  "primary",
  "primary-hover",
  "on-primary",
  "destructive",
  "destructive-hover",
  "on-destructive",
  ...["success", "warning", "error", "info"].flatMap((s) => [s, `${s}-subtle`, `${s}-border`]),
] as const;

/** `text`: 4.5:1; `large-text` and `ui` (component boundaries, focus, icons): 3:1. */
export type PairingUse = "text" | "large-text" | "ui";

export interface ColorPairing {
  fg: string;
  bg: string;
  use: PairingUse;
}

const REQUIRED_RATIO: Record<PairingUse, number> = { text: 4.5, "large-text": 3, ui: 3 };

const each = (fgs: string[], bgs: string[], use: PairingUse): ColorPairing[] =>
  fgs.flatMap((fg) => bgs.map((bg) => ({ fg, bg, use })));

const SURFACES = ["canvas", "surface", "surface-muted"];
const STATUSES = ["success", "warning", "error", "info"];

/** Every foreground/background combination the design system allows. */
export const colorPairings: ColorPairing[] = [
  ...each(["fg", "fg-secondary", "fg-muted", "primary", "accent"], SURFACES, "text"),
  // Alert body text sits on the subtle status backgrounds.
  ...each(
    ["fg"],
    STATUSES.map((s) => `${s}-subtle`),
    "text",
  ),
  ...each(["on-primary"], ["primary", "primary-hover"], "text"),
  ...each(["on-destructive"], ["destructive", "destructive-hover"], "text"),
  ...STATUSES.flatMap((s) => each([s], [`${s}-subtle`, "surface", "canvas"], "text")),
  ...each(["border-input", "focus", "destructive"], SURFACES, "ui"),
  ...each(["brand-teal"], ["surface"], "ui"),
];

export interface ContrastFailure {
  fg: string;
  bg: string;
  use: PairingUse;
  ratio: number;
  required: number;
}

export function findContrastFailures(
  tokens: ColorTokens,
  pairings: ColorPairing[],
): ContrastFailure[] {
  return pairings.flatMap(({ fg, bg, use }) => {
    const required = REQUIRED_RATIO[use];
    const fgValue = tokens[fg];
    const bgValue = tokens[bg];
    const ratio = fgValue && bgValue ? contrastRatio(fgValue, bgValue) : 0;
    return ratio >= required ? [] : [{ fg, bg, use, ratio: Number(ratio.toFixed(2)), required }];
  });
}
