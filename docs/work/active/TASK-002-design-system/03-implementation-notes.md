# Implementation notes: TASK-002 Design system

**Spec revision:** 1 (approved 2026-11-08)  
**Plan:** [02-implementation-plan.md](02-implementation-plan.md)  
**Branch:** `feature/TASK-002-design-system` (started from `381f8ec`; steps 1–15 and review round 1 fixes committed by the user in `7acff88`; review round 2 fixes uncommitted)  
**Status:** Steps 1–15 implemented with tests; review rounds 1 and 2 fixed (see the sections at the end). Step 16 done: the user passed the AC-9 manual accessibility check and approved the visual design (AC-13) on 2026-11-08. R3 resolved by adding an "Open design choices" section to `DESIGN-SYSTEM.md` (user decision, 2026-11-08).

## Changed files

| Area | Files |
|---|---|
| Workspace | `package.json` (root, npm workspaces), `package-lock.json`, `.nvmrc` |
| Web config | `web/package.json`, `web/vite.config.ts`, `web/vitest.build.config.ts`, `web/tsconfig.json`, `web/eslint.config.js`, `web/.prettierrc.json`, `web/.prettierignore`, `web/index.html` |
| Tokens | `web/src/styles/tokens.css` (single source of truth), `web/src/styles/index.css` |
| Design helpers | `web/src/design/contrast.ts`, `tokens.ts`, `colorLiterals.ts`, `buildChecks.ts` |
| Components | `web/src/components/ui/Button.tsx`, `Input.tsx`, `FormField.tsx`, `Alert.tsx`, `Card.tsx`, `Table.tsx`, `Spinner.tsx`; `web/src/lib/cn.ts` |
| Charts | `web/src/charts/chartTheme.ts`, `ChartWithTable.tsx` |
| App | `web/src/main.tsx`, `App.tsx`, `reference/ReferencePage.tsx`, `logo.svg`, `web/public/mark.svg` (copies of `assets/brand/`) |
| Tests | `*.test.ts(x)` beside each module; `web/src/test/setup.ts`, `web/src/test/axe.ts`; `web/build-checks/dist.test.ts` |
| CI | `.github/workflows/ci.yml` |
| Docs | `docs/design/DESIGN-SYSTEM.md` |

## Dependencies

Installed with user approval at current stable versions, pinned in `package-lock.json`. Notable majors: React 19.3, Vite 8.3, Vitest 5.1, TypeScript 6.0, Tailwind 4.3, ESLint 10.14, ECharts 6.1, echarts-for-react 3.0.6, culori 4.0. `@types/node@24` was added mid-step-1 with separate user approval (needed to type-check the file-reading tests). No other additions.

`echarts-for-react` declares support for React ≥16 and ECharts 6; the install had no peer conflicts (plan risk cleared).

## Test-first evidence

Each step's test was written and run before the production code. "Red" is the observed failure.

| Step | Test(s) | Red (observed) | Green |
|---|---|---|---|
| 1 | `App.test.tsx` smoke | Import `./App` could not be resolved | 1/1 |
| 2 | Scripts | n/a (configuration); format, lint, typecheck, build each exit 0 | — |
| 3 | `contrast.test.ts` | Module `./contrast` not found | 7/7 |
| 4 | `tokens.test.ts` | `./tokens` unresolved; then 33/39 failed because `css: false` blanked the `?raw` import (fixed in config, see deviations) | 39/39 |
| 5 | `colorLiterals.test.ts` | Module missing; then the guard found 4 literals in its own doc comment (comment reworded, guard unchanged) | 3/3 |
| 6 | `themeTokens.test.ts`, `buildChecks.test.ts` | 20/20 failed (`themeVariables` undefined); `./buildChecks` unresolved | 20/20, 5/5; real-build check 2/2 |
| 7, 9 | `cn`, `Spinner`, `Button` tests | Modules unresolved | 20/20 |
| 8 | `FormField.test.tsx` | Module unresolved | 11/11 |
| 9 | `Alert`, `Card` tests | Modules unresolved | 10/10 |
| 10 | `Table.test.tsx` | Module unresolved | 6/6 |
| 11 | `chartPalette.test.ts` | `chartPalettes` undefined | Pass (see palette results) |
| 12 | `chartTheme`, `ChartWithTable` tests | Modules unresolved | 13/13 |
| 13 | `ReferencePage.test.tsx`, `App.test.tsx` | Page module unresolved; app did not show the page. **Build check red:** with the page imported ungated, `check:build` failed with "assets/index-….js: contains the development-only reference page." | Gated with `import.meta.env.DEV` + lazy import; build check green; page tests 11/11 |

**Palette tuning (step 11):** a first hand-picked set failed under protanopia and deuteranopia (min ΔE 4.3 and 3.0). A throwaway search script (scratchpad only, not in the repository) with brand-aligned anchors produced the final set: min ΔE 27.7 normal; 14.6 protanopia, 12.8 deuteranopia, 12.1 tritanopia (targets 15 and 8); all at least 3:1 on white (asserted by the test). No change request was needed.

## Final verification (run once, from a clean install)

Run 2026-11-08 on Windows 11, Node v24.16.0, npm 11.17.0.

| Command | Result |
|---|---|
| `npm ci` | exit 0 |
| `npm run format:check` | exit 0, "All matched files use Prettier code style!" |
| `npm run lint` | exit 0, no problems |
| `npm run typecheck` | exit 0 |
| `npm test` | exit 0, 17 files, 160 tests passed; no warnings in output |
| `npm run build` | exit 0; `check:build` 2/2 passed (font bundled, no external hosts, no reference page) |
| `npm run dev -w web` | Served `http://localhost:5199/` with HTTP 200 and the app HTML; server stopped afterwards |
| `npm audit` (user-approved) | 10 moderate, all from one `minimatch` advisory (GHSA-g3hv-75wg-m249) reached through ESLint 10 and typescript-eslint. **Development tooling only.** `npm audit --omit=dev`: 0 vulnerabilities. Offered fix downgrades ESLint to 9 (breaking); not applied. |

The full test suite was also run twice consecutively before the clean install (both 160/160).

## Acceptance criteria mapping

| AC | Status | Evidence |
|---|---|---|
| AC-1 | Met | Clean-install verification table above; root `package.json` workspaces `["web"]` |
| AC-2 | Met | `tokens.css`; `tokens.test.ts` (all required roles; exact brand values); Tailwind `@theme` exposes utilities |
| AC-3 | Met | `tokens.test.ts`: helper known values, all 40 declared pairings pass, raw brand teal/gold never used as text |
| AC-4 | Met | Inter `.woff2` files in `web/dist/assets`; `themeTokens.test.ts` (font stack, 8-step scale); `check:build` (no external hosts); `tabular-nums` on numeric cells (`Table.test.tsx`) |
| AC-5 | Met | `themeTokens.test.ts` (breakpoints, radius, shadow, spacing, border widths); `DESIGN-SYSTEM.md` |
| AC-6 | Met | `colorLiterals.test.ts` scans all non-test sources; only `styles/tokens.css` may contain literals |
| AC-7 | Met | Component tests for behavior and ARIA plus axe with no violations for every component and state |
| AC-8 | Met | `chartPalette.test.ts`, `chartTheme.test.ts`, `ChartWithTable.test.tsx` (table equals data, empty state, length mismatch rejected, legend text) |
| AC-9 | Met (user, Chrome, 2026-11-08) | Checklist below: all five checks passed |
| AC-10 | Met | `ReferencePage.test.tsx`; production build check proves exclusion (red/green recorded in step 13) |
| AC-11 | Implemented; GitHub run **unverified** | `.github/workflows/ci.yml` inspected against the spec: Node from `.nvmrc`, `npm ci`, format, lint, typecheck, test, build; `permissions: contents: read`; no secrets, AWS, Docker, or deploy. Runs only after the user pushes. |
| AC-12 | Met | `docs/design/DESIGN-SYSTEM.md` rewritten |
| AC-13 | **Approved by the user, 2026-11-08** | The user reviewed the reference page and reported "all is good" |

## Deviations and decisions within scope

- **Vitest CSS handling:** `css: { include: [/tokens\.css/] }` instead of `css: false`, so the token file is real text in tests (otherwise the `?raw` import is blank). Other CSS stays stubbed.
- **axe `color-contrast` rule disabled in the test helper.** The simulated DOM cannot compute contrast (axe reports it as incomplete and logs canvas errors). Contrast is covered by AC-3's pairing tests and AC-9's manual check. All other axe rules run.
- **`App.test.tsx` lazy-load wait:** superseded in review round 2 (R1). Originally the wait was raised to 5 s, which matched Vitest's default 5 s test timeout and so could not help. The test now mocks `echarts`, waits up to 10 s, and has a 15 s test timeout. The assertion is unchanged.
- **Build check wiring:** `web` `build` = `vite build && npm run check:build`, so CI and local builds both enforce AC-4 and AC-10.
- **File-reading tests** use `// @vitest-environment node`.
- **Docs rule added:** at most six chart series (the categorical palette size). Group or filter beyond that.
- **Production bundle** (about 256 kB, 81 kB gzipped) excludes ECharts and the reference page. When a feature task adds charts to production, consider `echarts/core` with only the needed charts to reduce size.

## Limitations and follow-ups for the user

1. **AC-9 manual check and AC-13 approval** (below).
2. **Node version (decided 2026-11-08):** keep Node 24 (`.nvmrc` = `24`, installed v24.16.0).
3. **Audit finding (decided 2026-11-08):** user accepted the dev-only `minimatch` advisory (GHSA-g3hv-75wg-m249) through ESLint 10 and typescript-eslint. No runtime exposure (`npm audit --omit=dev`: 0). ESLint stays on 10; revisit when an upstream fix ships.
4. **CI actions** are pinned to major tags (`actions/checkout@v4`, `actions/setup-node@v4`), not commit SHAs.
5. **TASK-001 handover:** the web app now lives in `web/`; TASK-001 adds `api/` as a second workspace plus Docker Compose, and uses these components for sign-in.

## Manual check for AC-9 and review for AC-13

Run `npm run dev` and open the printed local URL (usually `http://localhost:5173/`) in a current desktop browser.

| # | Check | Result (fill in) |
|---|---|---|
| 1 | Press Tab from the top: every button, input, and table region is reached in a logical order, each with a visible teal focus outline | Pass (user) |
| 2 | Shift+Tab moves backwards the same way; nothing traps focus | Pass (user) |
| 3 | Narrow the window (or device toolbar) to 320 px wide: no sideways page scroll; tables scroll inside their own box | Pass (user) |
| 4 | Zoom to 200%: text and controls remain readable and usable | Pass (user) |
| 5 | Turn on "reduce motion" (Windows: Settings > Accessibility > Visual effects > Animation effects off): spinners stop rotating | Pass (user) |
| 6 | Visual review: colors, type, spacing, components, and the chart look right to you | **Approved** by the user, 2026-11-08 ("all is good") |

Browser used: Chrome (current desktop version)  Date: 2026-11-08  
Checks performed by the user; results reported to Claude and recorded here with the user.

## Review fixes (implementation pass 2, 2026-11-08)

The user chose to fix all review findings F1–F11 ([05-task-review.md](05-task-review.md)) and to add a role line per token. Suggestions S1–S3 were not in scope.

| Finding | Test first | Red (observed) | Fix | Green |
|---|---|---|---|---|
| F1 blank swatches | `findBuildProblems` requires every declared `--color-*` in built CSS; `dist.test.ts` passes the declared list | Unit cases failed; **real build check failed** listing the undefined variables | `@theme static` in `tokens.css` | Unit 14/14; real build 2/2 |
| F2 undeclared pairings | `colorPairings` must contain `fg` on each `*-subtle` and `accent` on `surface-muted` | 5 failed | Pairings added (now 45, all pass) | Pass |
| F3 guard scope | Named colors in arbitrary values, inline styles, SVG attributes; scan `.js`/`.jsx`/`.svg` | 8 failed | Guard extended; `logo.svg` exemption documented in the test | 18/18; no violations in sources |
| F4 external URLs | Any off-origin CSS `url()`, protocol-relative, external `<script src>` | 5 failed | Generic CSS `url()` and HTML `src`/`href` checks | Pass |
| F5 doc accuracy | Inspection | n/a (documentation) | `DESIGN-SYSTEM.md`: chart dark-mode caveat, border-width tokens described accurately, guardrails updated | — |
| F6 roles | Every token has a role; swatch shows it | Module missing | `design/tokenRoles.ts`; swatches show the role | Pass |
| F7 duplicate categories | Two identical labels give two distinct rows and no key warning | 1 failed | Rows keyed by index | Pass |
| F8 loading ARIA override | `aria-busy={false}` with `loading` keeps `true` | 1 failed | Caller props spread first; loading values win | Pass |
| F9 canvas contrast | Each categorical color at least 3:1 on `canvas` | **Passed on first run** (coverage gap closed, no defect) | None needed | Pass |
| F10 weak tests | Exact classes per Button variant; Enter/Space while loading; hyphenated sizes in `cn` | **Passed on first run** (behavior was already correct) | None needed | Pass |
| F11 comments in parser | Commented-out declarations ignored | 2 failed (`Duplicate color token`) | CSS comments stripped before parsing | Pass |

Two fixes were needed in my own code during the cycle: the widened guard flagged example values in its own doc comments (comments reworded, guard unchanged), and an arbitrary hex value was reported twice (now reported once).

**Effect on output:** built CSS grew from about 9 kB to 20 kB (5 kB gzipped) because `@theme static` emits every theme variable.

**Verification after the fixes** (current install; dependencies unchanged, so no `npm ci`):

| Command | Result |
|---|---|
| `npm run format:check` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` | exit 0, 18 files, 249 tests passed |
| `npm run build` | exit 0; `check:build` 2/2 (font, all 47 color variables defined, no external references, no reference page) |

## Review fixes (implementation pass 3, 2026-11-08)

Fixes for round 2 of [05-task-review.md](05-task-review.md): R1 (blocking), R2, and R4. **R3 (removed "Open design choices" section) needs the user's decision and is not changed.** S1–S3 remain open suggestions.

**R1: flaky `npm test`.**

- **Red (observed):** the task review saw 2 of 6 full-suite runs fail, plus 1 failure in its first run (3 of 8 in total). Each time it was `App.test.tsx > shows the design reference in development: Test timed out in 5000ms`.
- **Diagnosis:** the `findByRole` wait (5000 ms) equalled Vitest's default per-test timeout (5000 ms), so Vitest stopped the test before the wait could finish. Most of the lazy page's load time was the real `echarts` package. `ChartWithTable` imports `registerTheme` from it, and the test mocked only `echarts-for-react`. Measured with the test run alone: 932 ms with the real `echarts`, 334 ms with it mocked.
- **Fix (test only; no production change):** `App.test.tsx` also mocks `echarts`. The wait is now 10 s, under an explicit 15 s test timeout. The assertion is unchanged.
- **Green:** 10 consecutive full-suite runs, all exit 0 with 249/249. In a verbose full-suite run the test took 653 ms.

**R2:** header, status, and the superseded deviation bullet updated (above).

**R4:** `DESIGN-SYSTEM.md` now says the categorical colors are at least 3:1 on `surface` and on `canvas`. The `ci.yml` build-step comment now mentions the color-variable check.

**Verification after the fixes** (current install; dependencies unchanged):

| Command | Result |
|---|---|
| `npm run format:check` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` | exit 0, 18 files, 249 tests passed (plus the 10 repeated runs above) |
| `npm run build` | exit 0; `check:build` 2/2 |

**Criteria:** AC-1 is now reliably met (the R1 cause is removed, with repeated-run evidence). No other criterion's evidence changed. AC-9 and AC-13 are still waiting on the user.

## Simplicity check

No meaningful complexity, duplication, or coupling concern. Tokens have one source (`tokens.css`) read by both Tailwind and TypeScript. Components are small and independent. `ReferencePage.tsx` is the longest file, but it is a flat showcase of sections. No `/code-simplicity` stage needed.

## Handoff

AC-9 and AC-13 are recorded, and R3 is resolved. The round-3 review ([05-task-review.md](05-task-review.md)) found no remaining implementation work, so the next step is closeout (`06-closeout.md`) with the user.
