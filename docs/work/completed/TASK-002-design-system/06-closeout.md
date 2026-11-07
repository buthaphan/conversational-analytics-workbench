# Closeout: TASK-002 Design system

**Status:** Accepted by the user on 2026-11-08. External CI passed.  
**Spec revision:** 1 (approved 2026-11-08)  
**Branch:** `feature/TASK-002-design-system`. Review rounds 1–2 fixes are in `e629978`; round-3 fixes, the user's checks, and this closeout draft are in `aee343d`. History was rewritten on 2026-11-08, before the first push, to replace the commit identity with the user's GitHub no-reply address and remove an employer product name from the docs; commit IDs here are the rewritten ones. Pushed on 2026-11-08 to the private repository `buthaphan/conversational-analytics-workbench` (`main` at `d501e13`, this branch at `051133b`). `feature/TASK-001-user-accounts` stays local until that task resumes.

## Definition of Done

| Criterion | Status | Evidence |
|---|---|---|
| AC-1 Workspace and scripts | Met | All root scripts exit 0; `npm test` passed 20 consecutive runs after the flaky-test fix (R1). Clean `npm ci` and dev server recorded in [03-implementation-notes.md](03-implementation-notes.md); dependencies unchanged since. |
| AC-2 Color tokens | Met | `web/src/styles/tokens.css` (single source, `@theme static`); `tokens.test.ts` |
| AC-3 WCAG 2.2 AA contrast | Met | 45 declared pairings pass, including every pairing components use; ratio helper validated with known values |
| AC-4 Self-hosted font, type scale | Met | Inter `.woff2` in `web/dist`; `check:build` finds no external references; `tabular-nums` on numeric cells |
| AC-5 Spacing, radius, shadow, border, breakpoints | Met | Tokens; `themeTokens.test.ts`; [DESIGN-SYSTEM.md](../../../design/DESIGN-SYSTEM.md) |
| AC-6 No raw color literals | Met | `colorLiterals.test.ts` (hex, color functions, named colors, inline styles, SVG attributes) |
| AC-7 Components | Met | Behavior, ARIA, and axe tests for every component and state |
| AC-8 Chart palettes, theme, wrapper | Met | `chartPalette.test.ts` (on `surface` and `canvas`), `chartTheme.test.ts`, `ChartWithTable.test.tsx` |
| AC-9 Manual accessibility check | Met | User, Chrome, 2026-11-08: Tab and Shift+Tab, 320 px, 200% zoom, and reduced motion all passed (checklist in implementation notes) |
| AC-10 Reference page, development only | Met | Name, role, and value per token; all color variables in built CSS; `check:build` proves production exclusion |
| AC-11 CI workflow | Met | `.github/workflows/ci.yml` matches the spec. The GitHub Actions run for `feature/TASK-002-design-system` at `051133b` passed (reported by the user, 2026-11-08). |
| AC-12 `DESIGN-SYSTEM.md` | Met | All required topics; "Open design choices" section added at the user's direction (R3, 2026-11-08) |
| AC-13 Visual approval | Met | Approved by the user, 2026-11-08 |

Spec Definition of Done:

- [x] Every acceptance criterion is met with evidence, including AC-11's GitHub run.
- [x] Required tests and checks pass, and the results are recorded.
- [x] Review findings are resolved or explicitly accepted by the user (see below).
- [x] `DESIGN-SYSTEM.md` and known limitations are current.
- [x] The user has approved the reference page (AC-13).
- [x] The external CI state is reported accurately: passed (see below).
- [x] The user accepts closeout (2026-11-08).

## Verification and review

- **Required checks** (last run 2026-11-08, Windows 11, Node v24.16.0): `format:check`, `lint`, `typecheck`, `test` (249/249, 20 consecutive passes), and `build` with `check:build` 2/2, all exit 0. `npm audit`: 10 moderate in development tooling only; `--omit=dev` reports 0 (DEC-004).
- **Task review:** three rounds ([05-task-review.md](05-task-review.md)).
  - Round 1: F1–F11, including one blocking item (color swatches without CSS variables). All fixed.
  - Round 2: R1 blocking (flaky `npm test`), plus R2 and R4. All fixed.
  - Round 3: no new defects. R3 resolved by the user's decision.
  - **Unresolved:** only the optional suggestions S1–S3 (listed below).
- **External CI:** **passed.** GitHub Actions workflow `CI` ran on the push of `feature/TASK-002-design-system` (`051133b`) and passed, as reported by the user on 2026-11-08. It ran `npm ci`, `format:check`, `lint`, `typecheck`, `test`, and `build` with `check:build` on Ubuntu with Node from `.nvmrc`. `main` has no workflow file yet, so no run is expected there until this branch is merged. Runs: <https://github.com/buthaphan/conversational-analytics-workbench/actions> (private).

## Limitations and pending decisions

- **Pending decisions:** none. Decisions DEC-001 to DEC-005 are approved.
- **Dev-only audit finding (DEC-004):** `minimatch` advisory GHSA-g3hv-75wg-m249 through ESLint 10 and typescript-eslint. No runtime exposure. Revisit when an upstream fix ships.
- **Open suggestions (not required):**
  - S1: pin CI actions by commit SHA and set `persist-credentials: false`.
  - S2: give `Table` a tab stop only when it overflows.
  - S3: the raw `tokens.css` text is included in the production JS.
- **Test limits:** axe's `color-contrast` rule is off in the simulated DOM. Contrast is covered by the pairing tests and AC-9. There is no real-browser automation (DEC-003); layout, reflow, and visuals were checked manually.
- **Deferred design work:** listed in the "Open design choices" section of `DESIGN-SYSTEM.md`: dark-mode values and a dark chart theme, Radix for future dialog, select, tabs, menu, and toast components, and importing only the needed parts of ECharts when charts first ship in production.
- **TASK-001 handover:** the app now lives in `web/`. TASK-001 adds `api/` as a second workspace plus Docker Compose, and builds sign-in from these components.

## Workflow friction (actionable only)

- **A fix was recorded without proving it worked.** The original "raise the lazy-load wait to 5 s" change equalled Vitest's default 5 s test timeout, so it could not help. Two passing runs hid that. Action: when fixing a flaky test, record a repeated-run result (for example 10 runs) as evidence.
- **Each review round overwrote `05-task-review.md` in place.** Round 2's full findings exist only in the uncommitted history; round 3 keeps a summary. Action: commit between review rounds, or add each round as a new section instead of replacing the file.

## User acceptance

- Accepted by: buthaphan
- Date: 2026-11-08
- External CI result: Passed, 2026-11-08 (`feature/TASK-002-design-system` at `051133b`)
- Notes: Optional suggestions S1–S3 and the deferred design work stay open for later tasks. Next: merge `feature/TASK-002-design-system` into `main` through a pull request, then resume TASK-001.
