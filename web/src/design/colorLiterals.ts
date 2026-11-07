/** 3/4/6/8-digit hex colors and the opening of CSS color functions (rgb, hsl, oklch, ...). */
const HEX_OR_FUNCTION =
  /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/gi;
const HEX_OR_FUNCTION_TEST = new RegExp(HEX_OR_FUNCTION.source, "i");

/**
 * Tailwind arbitrary values (square brackets) on color-capable utilities.
 * Allowed: plain lengths, `length:` hints, and token references via var(--…).
 */
const ARBITRARY_COLOR_UTILITY =
  /\b(?:bg|text|border(?:-[trblxyse])?|ring(?:-offset)?|outline|fill|stroke|from|via|to|decoration|accent|caret|divide|placeholder)-\[(?!-?[\d.]+[a-z%]*\]|length:|var\(--)([^\]\s]+)\]/g;

/** Values that are not hard-coded colors. */
const SAFE_VALUE = /^(?:var\(|transparent$|currentColor$|inherit$|initial$|unset$|none$|url\()/i;

/** Color properties in inline style objects with a quoted string value. */
const STYLE_COLOR =
  /\b(?:color|background|backgroundColor|borderColor|outlineColor|fill|stroke)\s*:\s*(["'`])([^"'`]*)\1/g;

/** SVG/HTML color attributes with a quoted value. */
const ATTRIBUTE_COLOR = /\b(?:fill|stroke|color|stopColor|stop-color)=(["'])([^"']*)\1/g;

/** Returns the raw color literals found in source text, in source order, each reported once. */
export function findColorLiterals(source: string): string[] {
  const hits: { index: number; text: string }[] = [];
  const collect = (pattern: RegExp, keep: (m: RegExpMatchArray) => boolean = () => true) => {
    for (const match of source.matchAll(pattern)) {
      if (keep(match)) hits.push({ index: match.index ?? 0, text: match[0] });
    }
  };

  // A value already reported as hex or a color function is not reported again.
  const notHexOrFunction = (value: string) => !HEX_OR_FUNCTION_TEST.test(value);
  const namedColor = (m: RegExpMatchArray) => {
    const value = (m[2] ?? "").trim();
    return value !== "" && !SAFE_VALUE.test(value) && notHexOrFunction(value);
  };

  collect(HEX_OR_FUNCTION);
  collect(ARBITRARY_COLOR_UTILITY, (m) => notHexOrFunction(m[1] ?? ""));
  collect(STYLE_COLOR, namedColor);
  collect(ATTRIBUTE_COLOR, namedColor);

  return hits.sort((a, b) => a.index - b.index).map((h) => h.text);
}
