# Task review: TASK-002 Design system

**Review round:** 3 (re-review after implementation pass 3)  
**Reviewed revision/diff:** commit `e629978` plus uncommitted changes on `feature/TASK-002-design-system`: `web/src/App.test.tsx`, `.github/workflows/ci.yml`, `docs/design/DESIGN-SYSTEM.md`, `03-implementation-notes.md`. Reviewed 2026-11-08.  
**Spec revision:** 1 (approved 2026-11-08)  
**Method:** Read the round-3 diff, implementation notes, and spec. Searched `web/src` for other `echarts` mocks, lazy imports, and timed waits. Re-ran locally (no network): `format:check`, `lint`, `typecheck`, `build` (with `check:build`), and the root `npm test` script 10 times. Code outside this diff was reviewed in rounds 1 and 2 and has not changed since `e629978`; those results carry forward (summary below).  
**Independence caveat:** the same agent wrote the round-3 fix and this review. To offset that, every verification was re-run rather than taken from the notes, and the test-coverage impact of the new mock was checked separately.  
**History:** the round-1 review is in commit `e629978`. (Commit IDs were updated after the 2026-11-08 history rewrite.) Round 2 found R1–R4, recorded in the previous uncommitted version of this file and summarized below.

## Verification run in this review

| Command | Result |
|---|---|
| `npm run format:check` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` (10 consecutive runs) | **10/10 exit 0**, 249/249 each run |
| `npm run build` | exit 0; `check:build` 2/2 |

Together with the implementer's 10 runs, that is 20/20 full-suite passes after the fix. Before the fix, 3 of 8 runs failed. `package.json` and `package-lock.json` are unchanged, so the round-1 clean `npm ci` result still applies.

## Round-2 findings: re-verification

| # | Status | Evidence |
|---|---|---|
| R1 flaky `npm test` (blocking) | **Fixed** | The timeout mismatch is removed: the wait is 10 s under an explicit 15 s test timeout (`App.test.tsx:12-14, 24-38`). The main cause of the slow load is removed by mocking `echarts` (`App.test.tsx:10`). The assertion (the "Design reference" heading appears) is unchanged, so nothing was weakened. Recorded timings support the diagnosis (932 ms → 334 ms alone; 653 ms in a full run, against a 15 s limit). |
| R1 coverage impact | **None lost** | The `echarts` mock is limited to `App.test.tsx`. Real `registerTheme(CHART_THEME_NAME, chartTheme)` still runs in `ChartWithTable.test.tsx` and `ReferencePage.test.tsx`, which mock only `echarts-for-react`. `App.tsx:8` is the only lazy import, and `App.test.tsx` is the only timed wait in `web/src`. |
| R2 stale notes | **Fixed** | Header and status updated (`03-implementation-notes.md:5-6`); superseded deviation bullet rewritten; pass-3 section added. Its numbers match this review's observations (3 of 8 failures before the fix). |
| R3 "Open design choices" removed | **Pending user decision** | Not changed, correctly, because it is the user's choice. See below. |
| R4 doc drift | **Fixed** | `DESIGN-SYSTEM.md:83` now names `surface` and `canvas`, matching `chartPalette.test.ts`; the `ci.yml` comment mentions the color-variable check. |

Round-1 findings F1–F11 were confirmed fixed in round 2 and their code has not changed since.

## Findings (round 3)

| # | Severity | Finding | Location | Required action |
|---|---|---|---|---|
| — | — | No new defects found. | — | — |
| R3 | Decision | AC-12 asks for the "Open design choices" section to be updated. It was removed because all of its items were settled. Remaining open items (dark-mode values, when to add Radix or the shadcn CLI, ECharts tree-shaking before production charts) are not listed as open in one place. | `docs/design/DESIGN-SYSTEM.md` | User chooses: accept the removal, or add a short section listing those items. Either is consistent with the spec. |
| S1–S3 | Suggestion | Still open from round 1: pin CI actions by SHA and set `persist-credentials: false`; give `Table` a tab stop only when it overflows; the raw `tokens.css` is included in the production JS. | See round 1 | Optional. S2 is worth considering during the AC-9 tab-order check. |
| N1 | Note | The new wait (10 s) is generous. A real regression where the page never loads would still fail, just after 10 s rather than 5 s. This is acceptable. | `App.test.tsx:13` | None. |

## Acceptance criteria

| Criterion | Status | Evidence or gap |
|---|---|---|
| AC-1 | met | All root scripts exit 0; `npm test` 10/10 in this review (20/20 with implementer runs); clean `npm ci` and dev server recorded in round 1 with unchanged dependencies; workspaces `["web"]`. |
| AC-2 | met | Role and brand tokens in `tokens.css`; `tokens.test.ts`; exposed through Tailwind `@theme static`. |
| AC-3 | met | 45 declared pairings pass, including every pairing components use; helper validated with known values. |
| AC-4 | met | Inter `.woff2` bundled; no external references (`check:build` passes; inspected in round 2); type scale and `tabular-nums` tested. |
| AC-5 | met | Tokens, `themeTokens.test.ts`, `DESIGN-SYSTEM.md`. |
| AC-6 | met | Widened literal guard; no violations outside exempt files. |
| AC-7 | met | Component behavior, ARIA, and axe tests for every state. |
| AC-8 | met | Palette thresholds on `surface` and `canvas`, theme from tokens, table equals data. |
| AC-9 | **unverified** | Manual checklist in `03-implementation-notes.md:108-117` is still blank (no results, browser, or date). |
| AC-10 | met | Every token shows name, role, and value; all color variables defined in built CSS; production exclusion checked by `check:build`. Visual swatch rendering is confirmed under AC-13. |
| AC-11 | met (GitHub run unverified) | Workflow compliant: Node from `.nvmrc`, `npm ci`, the five scripts, `contents: read`, no secrets, AWS, Docker, or deploy. It runs only after the user pushes. The flake that would have made it unreliable is fixed. |
| AC-12 | met (R3 decision pending) | All required topics are present and accurate. The R3 choice does not affect the status. |
| AC-13 | **unverified** | User visual approval not yet recorded. |

## Security/privacy-relevant review

- The round-3 diff changes one test file, one CI comment, and documentation. There are no production code, dependency, permission, or secret changes.
- The CI workflow's steps and permissions are unchanged (comment only).
- Carried forward: the production build makes no external requests and excludes the reference page. DEC-004 (dev-only `minimatch` advisory) remains an accepted known limitation.

## Recommendation

**Pending user decision and user checks, then closeout.** No implementation work remains. Before closeout:

1. The user decides R3 (accept the removal, or add a short "Open design choices" section).
2. The user completes the AC-9 manual checklist and records the browser and date.
3. The user reviews the reference page for AC-13 and approves or requests changes. Changes would return to implementation and then review.

No requirement appears infeasible or ambiguous, so no decision-log entry is needed.
