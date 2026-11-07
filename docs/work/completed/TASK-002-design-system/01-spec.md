# Specification: TASK-002 Design system

**Status:** Approved (2026-11-08)  
**Revision:** 1  
**Owner:** User  
**Related idea:** [IDEA.md](../../../ideas/2026-11-08-design-system/IDEA.md), [FUNCTION-REVIEW.md](../../../ideas/2026-11-08-design-system/FUNCTION-REVIEW.md), [00-context.md](00-context.md)  
**Decision log:** [DECISION-LOG.md](DECISION-LOG.md)

## Problem and goal

Later tasks need a consistent, accessible interface, but only a brand direction exists ([DESIGN-SYSTEM.md](../../../design/DESIGN-SYSTEM.md)). Goal: an approved light-mode design system, delivered as documentation and code in a minimal web app, that TASK-001 (sign-in) and the analytics workspace use without making new styling decisions. Success is measured by passing automated contrast, palette, component, and accessibility checks, and by the user's approval of a reference page.

## Scope

### In scope

- npm workspaces at the repository root with a React, Vite, TypeScript, and Tailwind CSS app in `web/` ([DEC-002](DECISION-LOG.md#dec-002--repository-layout-and-package-manager)).
- Light-mode tokens named by role, kept dark-ready: color, typography, spacing, radius, shadow, border, breakpoints.
- Self-hosted Inter variable font ([DEC-001](DECISION-LOG.md#dec-001--typeface)).
- Starter components, shadcn-style (source kept in the project, built with `class-variance-authority`, `clsx`, and `tailwind-merge`; no shadcn CLI and no Radix in this task): Button, Input with FormField, Alert, Card, Table, and a loading Spinner.
- Chart palettes (categorical, sequential, diverging), an ECharts theme, and a chart wrapper that always provides an accessible data table.
- A development-only reference page showing every token, component state, and a sample chart with its table.
- Updated `docs/design/DESIGN-SYSTEM.md`.
- GitHub Actions CI for the web workspace.

### Out of scope

- Dark-mode values and verification (tokens only need to support adding them later).
- Sign-in, API, PostgreSQL, Docker Compose, sessions (TASK-001).
- Analytics workspace, data, AI, routing.
- Components not needed by TASK-001 or the first workspace (dialog, select, tabs, menus, toasts).
- Playwright or other real-browser automation ([DEC-003](DECISION-LOG.md#dec-003--test-tooling)).
- Production deployment, CDN, or AWS configuration.

## Assumptions and dependencies

- Node.js current LTS is available locally; the version is recorded in `.nvmrc` and used by CI. Owner: user. Validation: AC-1.
- Dependencies are installed at their current stable versions with user approval and pinned by `package-lock.json`. Expected runtime: `react`, `react-dom`, `echarts`, `echarts-for-react`, `@fontsource-variable/inter`, `class-variance-authority`, `clsx`, `tailwind-merge`. Expected development: `vite`, `@vitejs/plugin-react`, `typescript`, `tailwindcss`, `@tailwindcss/vite`, `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, an axe integration for Vitest, `culori` (color-vision simulation and color difference), ESLint with TypeScript and React Hooks rules, Prettier. Any substitution is recorded in implementation notes; a material one goes to the decision log.
- `echarts-for-react` must work with the installed React major version. If it does not, stop and raise a decision (options: pin React, or a thin in-house ECharts wrapper).
- No secrets or environment configuration are needed.
- GitHub Actions runs only after the user pushes; until then CI is verified by inspection and by running the same scripts locally.

## Acceptance criteria

| ID | Given / when / then or measurable criterion | Verification evidence | Status |
|---|---|---|---|
| AC-1 | From a clean checkout, `npm ci` then the root scripts `format:check`, `lint`, `typecheck`, `test`, and `build` all exit 0. `npm run dev -w web` serves the app locally. The root `package.json` declares `web` as a workspace, leaving room for `api`. | Command output recorded in implementation notes | Not started |
| AC-2 | Color tokens exist for these roles at minimum: page and raised surfaces, primary/secondary/muted text, border, input border, primary action and its hover and text, focus ring, and success/warning/error/info for foreground, background, and border. Brand navy, teal, and gold are included as brand tokens. Tokens are CSS custom properties from one source of truth and are exposed as Tailwind theme values. | Inspection; token tests read the same source as the CSS | Not started |
| AC-3 | Every declared foreground/background pairing meets WCAG 2.2 AA: at least 4.5:1 for normal text, at least 3:1 for large text, and at least 3:1 for UI component boundaries, focus indicators, and icons against adjacent colors. Where a brand color fails as text (for example teal on white), an accessible darker variant is used for text and the raw color is limited to non-text accents that meet 3:1 or are decorative. | Unit test over the declared pairings list. The ratio helper is validated against known values (black/white = 21:1; `#777777` on white below 4.5:1). | Not started |
| AC-4 | Inter variable is bundled from the app's own build output, with a defined fallback stack. A type scale (at least caption, body, small body, label, H1 to H3, display number) is defined as tokens. A tabular-figures style exists and is used for numeric table cells. The production build makes no requests to external font or CSS hosts. | Inspection; build output contains the font files; a test or build check finds no external font/CSS URLs in `web/dist` | Not started |
| AC-5 | Spacing, radius, shadow, and border-width tokens are defined and documented. Breakpoints are 640, 768, 1024, and 1280 px. Minimum supported width is 320 px. | Inspection of the token source and `DESIGN-SYSTEM.md` | Not started |
| AC-6 | Component source files contain no raw color literals (hex, `rgb()`, `hsl()`) or arbitrary Tailwind color values; colors come only from tokens. This keeps components dark-ready. | Automated check (test or lint rule) that fails on a literal outside the token source | Not started |
| AC-7 | **Button:** primary, secondary, ghost, and destructive variants. Visible focus via `:focus-visible`. Disabled cannot be activated. Loading shows a spinner, sets `aria-busy`, keeps an accessible name, and ignores repeat activation. **Input and FormField:** visible label programmatically associated; optional description; an error sets `aria-invalid` and links the message with `aria-describedby`; a required field is indicated in text, not by color alone. **Alert:** info, success, warning, and error variants, each with an icon or text label plus color. Error and warning shown in response to an action are announced (`role="alert"`); others use `role="status"`. **Card:** surface with optional header and footer. **Table:** caption, header cells with scope, right-aligned numeric columns with tabular figures, horizontal scroll inside its own container at narrow widths. **Spinner:** accessible label, reduced-motion respected. | Component tests (behavior and ARIA) plus an axe check with no violations for each component and state | Not started |
| AC-8 | Chart palettes: categorical has 6 colors, each at least 3:1 against the chart background, with every pair at least 15 CIEDE2000 apart in normal vision and at least 8 apart under simulated protanopia, deuteranopia, and tritanopia. Sequential has 5 steps with strictly monotonic lightness. Diverging has 5 steps around a neutral midpoint. The ECharts theme takes axis, grid, label, and tooltip colors and the font from tokens; tooltip and axis text meet AC-3. The chart wrapper always renders an accessible table with the exact values shown in the chart, and series are distinguishable without color (direct labels or legend text, plus the table). | Unit tests for palettes and theme; component test that the wrapper's table matches its data (ECharts rendering may be mocked in the simulated DOM) | Not started |
| AC-9 | Manual accessibility check of the reference page in a current desktop browser: all interactive elements reachable by Tab in logical order with a visible focus indicator; at 320 px width there is no horizontal page scroll (tables scroll inside their containers); content remains usable at 200% zoom; `prefers-reduced-motion` stops spinner animation. | Checklist with results and the browser used, recorded in implementation notes by the user or with the user | Not started |
| AC-10 | The reference page shows every color token (name, role, value), the type scale, spacing/radius/shadow samples, every component in every state from AC-7, and a sample chart with its table. It is available in development only; the production build does not include it. | Inspection; build check that a reference-page marker string is absent from `web/dist` | Not started |
| AC-11 | `.github/workflows/ci.yml` runs on push and pull request: set up Node from `.nvmrc`, `npm ci`, `format:check`, `lint`, `typecheck`, `test`, `build`. It uses no secrets, AWS, deployment, or Docker steps. | Inspection; the same scripts pass locally (AC-1). The GitHub run is reported as unverified until the user pushes. | Not started |
| AC-12 | `docs/design/DESIGN-SYSTEM.md` records the approved tokens, type scale, palettes, component list and usage rules, the contrast target, the 320 px minimum, and how to add dark mode (role tokens overridden under a theme selector). Its "Open design choices" section is updated. | Inspection | Not started |
| AC-13 | The user reviews the reference page and approves the visual design, or requests changes that are made and re-reviewed. | Approval recorded with date in implementation notes and closeout | Not started |

## Security, privacy, accessibility, and operations

- **External requests:** no third-party font, CSS, or script hosts at runtime (AC-4). Dependencies come from npm with user approval and are pinned by the lockfile.
- **Dependency audit:** run `npm audit` after install (it needs network, so ask first) and record the results; high or critical findings in runtime dependencies are raised to the user.
- **Secrets:** none required; no `.env` files are created.
- **Accessibility:** WCAG 2.2 AA is the target, covering contrast, non-text contrast, focus visibility, reflow at 320 px, labels and errors, status messages, and reduced motion. Automated axe checks in a simulated DOM catch many issues but not all, so AC-9 adds manual checks.
- **Production exposure:** the reference page is development-only (AC-10).
- **Operations:** no runtime services beyond the Vite dev server. CI has no credentials.

## Test strategy

| Criterion | Test level/type | Important cases | Evidence / command |
|---|---|---|---|
| AC-1 | Script runs | Clean `npm ci`; each script exits 0; the dev server starts | Outputs in notes |
| AC-2 | Unit and inspection | All required roles present; Tailwind exposes them | `npm test`; inspection |
| AC-3 | Unit | Ratio helper known values (21:1, just under 4.5:1); every declared pairing passes; a deliberately failing pair fails the test (red step) | `npm test` |
| AC-4 | Inspection and build check | Font files in `dist`; no `fonts.googleapis`, `fonts.gstatic`, or other external CSS/font URLs; tabular figures class on numeric cells | `npm run build` plus check |
| AC-5 | Inspection | Tokens and breakpoints match | Review |
| AC-6 | Automated guard | A literal in a component fails the check; the token source is exempt | `npm test` or `npm run lint` |
| AC-7 | Component (RTL) and axe | Each variant and state; disabled and loading block activation; label/description/error wiring; alert roles; table caption and scope; reduced motion | `npm test` |
| AC-8 | Unit and component | Contrast vs chart background; pairwise ΔE under normal and three simulated deficiencies; sequential monotonic lightness; diverging neutral midpoint; theme reads tokens; wrapper table equals input data, including empty data | `npm test` |
| AC-9 | Manual | Tab order and focus; 320 px; 200% zoom; reduced motion | Checklist in notes |
| AC-10 | Inspection and build check | Development renders the page; production build excludes it | Dev server; build check |
| AC-11 | Inspection | Steps and order; no secrets, AWS, or deployment | Review |
| AC-12 | Inspection | All sections updated | Review |
| AC-13 | User review | Approval or a change round | Notes and closeout |

If a palette threshold in AC-8 proves infeasible with 6 colors, do not weaken the test silently: raise a change request in the decision log with options (fewer colors, adjusted thresholds, or added patterns).

## Definition of Done

- [ ] Every acceptance criterion is met and supported by evidence.
- [ ] Required tests and checks pass and the results are recorded.
- [ ] Review findings are resolved or explicitly accepted by the user.
- [ ] `DESIGN-SYSTEM.md` and known limitations are current.
- [ ] The user has approved the reference page (AC-13).
- [ ] The user accepts closeout; the external CI state is reported accurately.

## Open decisions

None blocking. Proposals approved with this spec (change them if you disagree):

- WCAG 2.2 AA contrast target and 320 px minimum width (from the function review; 320 px follows from AA reflow).
- Web CI starts in this task; Docker Compose waits for TASK-001.
- Reference page is development-only.
- Components follow the shadcn pattern without the CLI and without Radix for now.
- `culori` for palette checks.

## Revision history

| Revision | Date | Change | User approval |
|---|---|---|---|
| 1 | 2026-11-08 | Initial draft, including the proposals listed under Open decisions | Approved by user, 2026-11-08 |
