# Design system

**Status:** Implemented in TASK-002; visual design approved by the user on 2026-11-08 (TASK-002 AC-13).  
**Source of truth for values:** [`web/src/styles/tokens.css`](../../web/src/styles/tokens.css). Tests read the same file, so this page lists decisions and rules rather than repeating every value.  
**Review it live:** run `npm run dev` and open the development-only design reference page.

## Purpose

Give the product a consistent, polished, accessible analytics interface. Feature tasks use these tokens and components instead of making new styling decisions.

## Principles

- Put the user's question, data scope, and active result in clear view.
- Calm, professional business interface with generous spacing and restrained decoration.
- Show exact numbers in tooltips and always provide an accessible table of the values behind a chart.
- Make the active dataset/session visible. Explain and confirm before replacing it with a different data scope.
- Support keyboard use, responsive layouts, readable contrast, and clear loading, empty, clarification, error, and success states.

## Accessibility target

- **WCAG 2.2 AA.** Text is at least 4.5:1; large text, UI component boundaries, focus indicators, and icons are at least 3:1.
- Every allowed foreground/background combination is declared in `web/src/design/tokens.ts` (`colorPairings`) and tested. A new combination must be added there and pass.
- **Minimum supported width: 320 px** (AA reflow). Tables scroll inside their own focusable container; the page does not scroll sideways.
- Animation respects `prefers-reduced-motion`.
- Color is never the only cue: status messages carry a text label and icon, form errors carry text, and charts carry legend text plus a data table.

## Color

Tokens are named by role, not by hue, and are exposed as Tailwind utilities (`bg-surface`, `text-fg`, `border-border-input`, ...). Tailwind's default palette is disabled, so only project tokens exist. Tokens are declared with `@theme static`, so every `--color-*` variable is present in the CSS even when no utility uses it. The reference page lists each token's role.

| Group | Tokens | Rules |
|---|---|---|
| Brand | `brand-navy` `#18324B`, `brand-teal` `#14A38B`, `brand-gold` `#E5A93D` | Accents only. Teal (3.2:1 on white) and gold (2.1:1) are **not** text colors; use `accent` for teal-toned text. |
| Surfaces | `canvas` (page), `surface` (raised: cards, inputs, tables), `surface-muted` (table headers, hover) | |
| Text | `fg`, `fg-secondary`, `fg-muted`, `accent` | All meet 4.5:1 on every surface (tested); `fg` also on each status `-subtle` background. |
| Borders and focus | `border` (decorative dividers), `border-input` (form controls, 3:1), `focus` (focus outline) | Use `border-input` wherever a border identifies a control. |
| Actions | `primary`, `primary-hover`, `on-primary`, `destructive`, `destructive-hover`, `on-destructive` | Primary actions use brand navy. |
| Status | `success`, `warning`, `error`, `info`, each with `-subtle` (background) and `-border` | The base token is the text and icon color; it meets 4.5:1 on its subtle background, on `surface`, and on `canvas`. |

## Typography

- **Typeface:** Inter Variable, self-hosted from the app bundle (`@fontsource-variable/inter`); no font CDN. Fallback: `ui-sans-serif, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`.
- **Scale** (Tailwind `text-*`; Tailwind's default sizes are disabled):

| Token | Size / line height | Use |
|---|---|---|
| `text-display` | 36 / 40 px, 600 | Headline numbers (with `tabular-nums`) |
| `text-h1` | 28 / 36 px, 650 | Page title |
| `text-h2` | 22 / 30 px, 600 | Section title |
| `text-h3` | 18 / 28 px, 600 | Card and subsection title |
| `text-body` | 16 / 24 px | Default text |
| `text-body-sm` | 14 / 20 px | Secondary text, tables, alerts |
| `text-label` | 14 / 20 px, 500 | Form labels, table captions |
| `text-caption` | 12 / 16 px | Metadata |

- Numeric table columns are right-aligned and use `tabular-nums`.

## Spacing, radius, elevation, borders, breakpoints

- **Spacing:** 4 px unit (`p-1` = 4 px, `p-4` = 16 px).
- **Radius:** `rounded-sm` 4 px, `rounded-md` 6 px (controls), `rounded-lg` 10 px (cards, tables), `rounded-full`.
- **Shadow:** `shadow-sm` (cards), `shadow-md` (raised overlays later). Navy-tinted and subtle.
- **Border widths:** two reference tokens, `--border-width-default` (1 px) and `--border-width-strong` (2 px). Components apply them through Tailwind's matching utilities: `border` (1 px) for surfaces and inputs, and `outline-2` (2 px) for the focus outline. Keep the tokens and utilities in step if either changes.
- **Breakpoints:** `sm` 640, `md` 768, `lg` 1024, `xl` 1280 px. Design mobile-first from 320 px.

## Components

Built in the shadcn style: source lives in `web/src/components/ui/`, styled with tokens through `cn()` and `class-variance-authority`. No shadcn CLI or Radix yet; add them only when a component needs them (for example dialog or select).

| Component | Variants and states | Accessibility rules |
|---|---|---|
| `Button` | `primary`, `secondary`, `ghost`, `destructive`; sizes `sm`, `md`; disabled; loading | Defaults to `type="button"`. Visible `focus-visible` outline. Loading keeps focus, sets `aria-busy` and `aria-disabled`, and ignores repeat clicks. |
| `FormField` + `Input` | default, description, error, required, disabled | Label is linked to the input; description and error are linked with `aria-describedby`; errors set `aria-invalid`; "required" is stated in text. |
| `Alert` | `info`, `success`, `warning`, `error` | Error and warning use `role="alert"`; info and success use `role="status"`. Each includes a hidden text label ("Error:") and an icon in addition to color. |
| `Card` | optional title (heading level 2–4), footer | A titled card is a labelled region. |
| `Table` | numeric columns, row headers, empty state | Caption, `scope` on headers, focusable horizontal-scroll container. |
| `Spinner` | announced or decorative | Announced as a status with a label; decorative inside buttons; animation only when motion is allowed. |

## Charts

- **Library:** Apache ECharts via `echarts-for-react`, with the `cawb` theme (`web/src/charts/chartTheme.ts`) built only from tokens.
- **Always use `ChartWithTable`.** It renders the chart plus a table of the exact charted values, a figure caption, and a text alternative pointing to the table.
- **Categorical palette** (`chart-1` to `chart-6`): blue, teal, amber, crimson, plum, mauve. Each is at least 3:1 on `surface` and on `canvas`. Every pair differs by at least 15 (CIEDE2000) in normal vision and at least 8 under simulated protanopia, deuteranopia, and tritanopia (tested). Use at most six series; beyond that, group or filter.
- **Sequential** (`seq-1` to `seq-5`): light to dark, ending at brand navy, for ordered magnitudes.
- **Diverging** (`div-1` to `div-5`): crimson to blue around a neutral grey midpoint, for values above and below a baseline.
- Chart text (axis labels, legend, tooltip) meets 4.5:1.
- If a requested chart type would be unreadable for the data, explain and offer an alternative (see the [capability catalogue](../product/AI-DATA-CAPABILITIES.md)).

## Dark mode (later)

Light mode only for now. Every UI component uses role tokens through CSS variables, and `@theme static` guarantees all variables exist, so dark mode is added by:

1. Overriding the same `--color-*` variables under a theme selector (for example `[data-theme="dark"]`).
2. Adding the dark pairings to the contrast test and checking the chart palette against the dark surface.
3. **Charts:** ECharts draws on a canvas and cannot read CSS variables, so `chartTheme.ts` copies token values when it loads. Dark mode needs a second chart theme built from the dark values and selected (or charts re-rendered) when the theme changes.

Other components should need no changes.

## Guardrails (tested)

- No raw color literals outside `tokens.css`: hex values, color functions, named colors in Tailwind arbitrary values or inline styles, and SVG `fill`/`stroke` colors are all rejected (`colorLiterals.test.ts`). The brand logo `web/src/logo.svg` is the only other exempt file.
- All declared pairings meet AA, including every combination components actually use (`tokens.test.ts`); palette contrast on `surface` and `canvas` and distinguishability (`chartPalette.test.ts`).
- Every color token has a documented role (`tokenRoles.test.ts`), shown on the reference page.
- The production build (`npm run build` runs `check:build`): bundles the font; defines every declared `--color-*` variable; loads no external stylesheet, script, font, or `url()` resource (including protocol-relative URLs); and excludes the reference page.

## Open design choices

Everything above is decided. These items are deliberately left for later tasks:

- **Dark-mode values:** the structure is ready (see "Dark mode (later)"); the colors, their contrast checks, and a dark chart theme are not chosen yet.
- **More components:** dialog, select, tabs, menus, and toasts are added when a feature needs them. Add Radix (and optionally the shadcn CLI) at that point for accessible behavior, rather than building it by hand.
- **Chart bundle size:** ECharts is not in the production bundle yet. When a feature first ships a chart, import from `echarts/core` with only the needed chart types instead of the full package.

## Selected logo

The transparent SVGs in `assets/brand/` are the logo assets (copied into `web/` for the app). The PNG below is a reference crop only.

![Selected circular mark reference](../../assets/brand/reference/selected-mark-reference-crop.png)
