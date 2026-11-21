/**
 * What each color token is for. Shown on the design reference page; every token in
 * styles/tokens.css must have an entry (tokenRoles.test.ts).
 */
export const tokenRoles: Record<string, string> = {
  "brand-navy": "Brand accent; logo and brand moments (also the primary action color)",
  "brand-teal": "Brand accent for non-text marks only (3.2:1 on white)",
  "brand-gold": "Brand accent for decoration only (not text, not UI boundaries)",

  canvas: "Page background behind all content",
  surface: "Raised surfaces: cards, inputs, tables, chart background",
  "surface-muted": "Subtle fill: table headers, hover states, disabled inputs",

  fg: "Primary text and headings",
  "fg-secondary": "Secondary text: descriptions, captions, table headers",
  "fg-muted": "Lowest-emphasis text: metadata, axis labels",
  "fg-placeholder":
    "Placeholder text in inputs (on surface only; the faintest text that meets 4.5:1)",
  accent: "Teal-toned text and links (text-safe version of brand teal)",
  "accent-subtle": "Teal-tinted background for icon tiles",
  highlight: "Gold-toned text and icons on light surfaces (text-safe version of brand gold)",
  "highlight-subtle": "Gold-tinted background for icon tiles",
  "on-brand-accent": "Gold text and icons on the brand-navy header",

  border: "Decorative dividers and surface outlines",
  "border-input": "Borders that identify a control (inputs, secondary buttons); 3:1",
  focus: "Keyboard focus outline on every interactive element",

  primary: "Primary action background; ghost button text",
  "primary-hover": "Primary action background on hover",
  "on-primary": "Text and icons on primary actions",
  destructive: "Destructive action background (delete, discard)",
  "destructive-hover": "Destructive action background on hover",
  "on-destructive": "Text and icons on destructive actions",

  success: "Success text and icons",
  "success-subtle": "Success message background",
  "success-border": "Success message border",
  warning: "Warning text and icons",
  "warning-subtle": "Warning message background",
  "warning-border": "Warning message border",
  error: "Error text, icons, and invalid input borders",
  "error-subtle": "Error message background",
  "error-border": "Error message border",
  info: "Information text and icons",
  "info-subtle": "Information message background",
  "info-border": "Information message border",

  "chart-1": "Chart series 1 (blue)",
  "chart-2": "Chart series 2 (teal)",
  "chart-3": "Chart series 3 (amber)",
  "chart-4": "Chart series 4 (crimson)",
  "chart-5": "Chart series 5 (plum)",
  "chart-6": "Chart series 6 (mauve)",

  "seq-1": "Sequential scale, lowest value",
  "seq-2": "Sequential scale, low value",
  "seq-3": "Sequential scale, middle value",
  "seq-4": "Sequential scale, high value",
  "seq-5": "Sequential scale, highest value (brand navy)",

  "div-1": "Diverging scale, strongest negative",
  "div-2": "Diverging scale, mild negative",
  "div-3": "Diverging scale, neutral midpoint",
  "div-4": "Diverging scale, mild positive",
  "div-5": "Diverging scale, strongest positive",
};
