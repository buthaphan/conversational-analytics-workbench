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
| Text | `fg`, `fg-secondary`, `fg-muted`, `fg-placeholder` (input placeholders, 14 px, on `surface` only), `accent`, `highlight` | All meet 4.5:1 on every surface (tested); `fg` also on each status `-subtle` background. `accent` (teal) and `highlight` (gold) are the text-safe companions of the brand teal and gold. |
| Accent tints | `accent-subtle` (teal), `highlight-subtle` (gold), `on-brand-accent` (light gold) | Tile backgrounds for `accent` and `highlight` icons; `on-brand-accent` is gold text and icons on the navy header (tested on both ends of its gradient). |
| Borders and focus | `border` (decorative dividers), `border-input` (form controls, 3:1), `focus` (focus outline, dark grey, the same value as `fg-secondary`) | Use `border-input` wherever a border identifies a control. Buttons, tables, and other focusable regions show a 2 px dark-grey `focus` outline. Text inputs show focus differently: their border darkens to `fg-secondary` and thickens to 2 px (stays `error` when invalid), with no outline ring. |
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
- **Radius:** `rounded-sm` 4 px, `rounded-md` 6 px (controls), `rounded-lg` 10 px (tables, messages, inner panels), `rounded-xl` 14 px (cards and the workspace panels), `rounded-full`.
- **Shadow:** `shadow-sm` (messages), `shadow-md` (cards, workspace panels, header). Navy-tinted and subtle.
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
| `Icon`, `IconTile` | outline icons on a 24 px grid in the current text color; `IconTile` tones `blue` (`info` on `info-subtle`), `teal` (`accent` on `accent-subtle`), `gold` (`highlight` on `highlight-subtle`) | Always decorative (`aria-hidden`): every icon sits beside text that carries its meaning. An icon-only button keeps a visually hidden text name. |

### Workspace look (restyle, 2026-11-17)

- **Color balance:** blue for your own messages and the data (charts, primary actions); teal and gold, the logo's bar colors, for icons, so the screen is not all blue.
- **Header:** brand navy deepening to `primary-hover` (left to right), with the logo, the tagline as real text beside it (from 768 px; inside the logo image it was too small to read), set as a semibold light-gold pill with a faint gold outline and gold sparkle icons before each sentence, and a gold user icon and email (`on-brand-accent`), and an outlined Sign out button in `on-primary`.
- **Scope summary:** one strip: a teal icon tile with the result title and period, then each setting with a small teal icon and caption-size label, separated by dividers on wide screens.
- **Conversation:** one card with a teal chat icon in its title bar, a scrolling history on `canvas`, and the input with an icon-only Send button below. Your messages sit on `info-subtle` with an `info-border` edge and a blue person icon; the assistant's on `surface` with a gold sparkle (`highlight`).
- **Concentration result:** a share ring (`chart-2` teal on an `accent-subtle` track) with the percentage in the middle, beside the figures table, which stays the evidence.

## Charts

- **Library:** Apache ECharts via `echarts-for-react`, with the `cawb` theme (`web/src/charts/chartTheme.ts`) built only from tokens.
- **Always use `ChartWithTable`.** It renders the chart plus a table of the exact charted values, a figure caption, and a text alternative pointing to the table.
- **Categorical palette** (`chart-1` to `chart-6`): blue, teal, amber, crimson, plum, mauve. Each is at least 3:1 on `surface` and on `canvas`. Every pair differs by at least 15 (CIEDE2000) in normal vision and at least 8 under simulated protanopia, deuteranopia, and tritanopia (tested). Use at most six series; beyond that, group or filter.
- **Sequential** (`seq-1` to `seq-5`): light to dark, ending at brand navy, for ordered magnitudes.
- **Diverging** (`div-1` to `div-5`): crimson to blue around a neutral grey midpoint, for values above and below a baseline.
- Chart text (axis labels, legend, tooltip) meets 4.5:1.
- **Series styling (theme):** lines 2.5 px with hollow point markers, and a single line is lightly shaded underneath (not with a comparison); bars have rounded outer ends; pie slices are separated by the surface color. The legend sits below the chart.
- If a requested chart type would be unreadable for the data, explain and offer an alternative (see the [capability catalogue](../product/AI-DATA-CAPABILITIES.md)).

### Chart rules per result shape (TASK-005)

| Result shape | Suitable views | New result starts as |
|---|---|---|
| Customer or product rows | bar, horizontal bar, table | bar |
| Grouped products (category, department, brand) | bar, horizontal bar, pie, table | bar (keeps the current view if it suits) |
| Sales over time | line, bar, table | line |

- **Unsuitable views:** a request for one is refused with the reason and the suitable views, and the current view stays. After a change of shape (for example ungrouping a pie), the view falls back to the shape's default. A view change never retrieves data.
- **Horizontal bar:** categories on the vertical axis, the first (largest in the view's order) at the top. Use it when labels are long, such as product or brand names. It is offered, not chosen automatically.
- **Pie:** only for groups that add up to a whole.
  - At most 6 slices: with more groups, the 5 largest by the view's measure plus one "Other" slice, and the answer says how many groups "Other" holds.
  - Every slice carries a text label with its share, so color is not the only cue.
  - The table under the pie gives each slice's value and share. A second table below lists every category or department; for brands it lists the brand cap (top 20) and "Other", titled accordingly (TASK-005 DEC-004).
  - Colors come only from the categorical palette, which has exactly 6 colors.
- **"Other" in bar charts (DEC-001):** a grouped bar or horizontal-bar chart lists the "Other (*n* brands)" row in its table but does not draw it, because it would dwarf the brand bars. A note under the chart names it and its share.
- **Line, one series:** the measure over time; a partial bucket is labelled "(partial)" on the axis and in the table, and the table gives each bucket's real dates.
- **Line, two series (comparison):** two lines aligned by bucket position, named by their periods (legend text, not color alone). A shorter period leaves gaps. The table lists both periods' dates and values and the change; a period-totals table follows.
- **Change values** carry a sign ("+$50.00", "−2", with a true minus sign); a % change from a zero total is "None (from zero)".

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
- **Chart bundle size:** charts now ship (TASK-003 to TASK-005) with the full `echarts` package. Importing from `echarts/core` with only the bar, line, and pie chart types would shrink the bundle; not done yet.

## Selected logo

The transparent SVGs in `assets/brand/` are the logo assets (copied into `web/` for the app). The PNG below is a reference crop only.

- `logo.svg`: for light backgrounds.
- `logo-on-dark.svg`: for the brand-navy header (TASK-004 DEC-004). The same artwork with a white ring, tail, and wordmark; the teal and gold bars are unchanged. The app's copy (`web/src/logo-on-dark.svg`) drops the tagline and crops the empty margins, so the name reads larger at header height; the header shows the tagline as text (2026-11-17).
- **Header:** `bg-brand-navy`, showing only the logo, which is the page's `h1` and named by its alt text, plus the tagline and email in `text-on-brand-accent` (tested pairing). Controls on it use a white focus ring (`focus-visible:outline-on-primary`), because the default dark-grey ring would not show on navy.

![Selected circular mark reference](../../assets/brand/reference/selected-mark-reference-crop.png)
