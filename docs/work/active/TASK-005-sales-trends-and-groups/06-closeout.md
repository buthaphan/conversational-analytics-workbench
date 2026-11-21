# Closeout: TASK-005 Sales trends and group performance

**Status:** Awaiting the user's acceptance. External CI passed for `c4fc3db` (reported by the user, 2026-11-21).  
**Spec revision:** 3 (approved 2026-11-15)  
**Branch:** `feature/TASK-005-sales-trends-and-groups`, pushed. Spec and plan `e026773`; implementation, walkthrough fixes, and review fixes `c4fc3db`.

## Definition of Done

| Criterion | Status | Evidence |
|---|---|---|
| AC-1 Profile additions | Met | [THELOOK-PROFILE.md](../../../product/THELOOK-PROFILE.md): departments, 2,756 brands, 24 null brands, daily ranges, caps (brand 20, series 4,000), and rows, bytes, and latency of the final queries (review SF-4 fixed). |
| AC-2 Product rows gain `department` and `brand` | Met | Registry, fixture, and BigQuery tests; a null brand becomes "Unknown brand"; brand values only as a count in the model context (`model-context.test.ts`, 50-brand leak list). |
| AC-3 Time-series request validation | Met | `turn-decision.test.ts`, `registry.test.ts` (31/32, 92/93, 366/367 boundaries, comparison periods). Review SF-1 (interval re-check) and S-1 (29 Feb exclusive end) fixed with tests. |
| AC-4 Time-series retrieval | Met | `time-series.test.ts`, `bigquery-data-source.test.ts`: fixed SQL with typed parameters only, zero-fill, today cut-off, 4,000-row cap. |
| AC-5 Roll-up and series view | Met | `result-engine.test.ts`: day, week, month sums; ISO weeks across a year; partial buckets; totals in cents; no % change from zero. |
| AC-6 Same data or switch | Met | Orchestrator tests: a filter, comparison, or scope change asks first and retrieves only on confirmation; interval and measure never retrieve. |
| AC-7 What applies to a time series | Met | Orchestrator tests: sort, limit, measure filter, grouping, and concentration are refused with an alternative and change nothing. |
| AC-8 Grouped view | Met (DEC-003 limitation) | Engine and orchestrator tests for each dimension, brand top 20 plus exact "Other", `group` operation removed. A requested brand count is refused in practice (DEC-003). |
| AC-9 Views and chart rules | Met | Orchestrator view × shape matrix (15 pairs); pies with 2, 6, 7, and 26 groups. |
| AC-10 Answers | Met | `answers.test.ts`: series, partial buckets, cut-off, up / down / no change / zero baseline without causal words, grouped answers with "Other". |
| AC-11 Web rendering | Met | `ChartWithTable.test.tsx`, `ResultView.test.tsx`, `format.test.ts`, with axe on the new views; 320 px checked by the user. Brand-pie table title per DEC-004. |
| AC-12 Model contract | Met | Strict schema (23 optional properties); catalogue and demo-model tests; live smoke call accepted. |
| AC-13 Known-answer check | Met | Live: 17 of 17; 21 rows checked by hand. |
| AC-14 Model evaluation | Met | 60 of 61 (98.4%), safety 11 of 11; baseline `api/src/live/eval/baseline.claude-sonnet-5-5.json`. The one failure, `grp-02`, is DEC-003. |
| AC-15 Regression and CI | Met | Local lint, typecheck, build, and `npm test` pass; each changed test is justified in the task review; CI passed for `c4fc3db`. |
| AC-16 Walkthrough | Met (DEC-005) | User walkthrough 2026-11-15: every step passes, W1–W4 fixed and rechecked; step 11 is DEC-003. Latency and cost from the evaluation (DEC-005). |
| AC-17 Docs | Met | Capability catalogue, profile, design-system chart rules, README (views, costs, live checks, known limitations). |

Spec Definition of Done:

- [x] Every acceptance criterion is met and supported by evidence.
- [x] Required tests and checks pass, and the results are recorded.
- [x] The known-answer check and the evaluation threshold are met; the new baseline is stored.
- [x] Review findings are resolved or explicitly accepted by the user (SF-1, SF-4, and S-1 fixed; SF-2 as DEC-004; SF-3 as DEC-005; S-2 to S-5 deferred).
- [x] Documentation, the profile, and known limitations are current.
- [x] The user completed the manual walkthrough (AC-16).
- [ ] The user accepts closeout; the external CI state is reported accurately (passed for `c4fc3db`).

## Verification and review

- **Final checks** (after the review fixes, 2026-11-15):
  - `npm run lint`, `npm run typecheck`, and `npm run build` exit 0.
  - `npm test`: API 33 files, 687 passed; web 26 files, 368 passed plus 1 deliberately failing self-test.
  - Rerun on 2026-11-21: `format.test.ts` and `ResultView.test.tsx`, 26 passed.
- **Live checks:** profile run (step 1); known-answer 17 of 17; evaluation 60 of 61 (safety 11 of 11) in each full run. Model spend recorded in the notes: about $0.61 (smoke call, three full evaluation runs, one targeted run).
- **Dependencies:** none added or changed. Production audit: 0 vulnerabilities. Development only: 9 moderate, one `minimatch` advisory via the ESLint tooling, unchanged from TASK-004.
- **Pre-commit check (2026-11-21):** every added line scanned for keys, tokens, credentials, cloud identifiers, and personal data; none found. `.env` and `.claude/settings.local.json` are ignored.
- **Task review** ([05-task-review.md](05-task-review.md)): no blocking defects. SF-1 and S-1 fixed with tests (red first); SF-4 documentation added; SF-2 and SF-3 settled as DEC-004 and DEC-005.
- **External CI:** passed for `c4fc3db` (reported by the user, 2026-11-21).

## Decisions

- **DEC-001:** bar charts don't draw "Other"; it stays in the table, with a note.
- **DEC-002:** interval and measure are view settings; only the product filter and comparison change the query.
- **DEC-003:** known limitation: a request for a number of brands is refused; grouping by brand shows the top 20.
- **DEC-004:** the table under a brand pie lists the top 20 and "Other", titled accordingly.
- **DEC-005:** walkthrough latency and cost taken from the evaluation.

## Limitations and pending decisions

- **Pending decisions:**
  - The development-only `minimatch` advisory: leave as is, or update the ESLint tooling in a later task (the suggested `npm audit fix --force` is a breaking downgrade).
- **Known limitations:**
  - **DEC-003:** "top N brands" is refused; the model sends a time-series measure instead of a limit.
  - Sales over time filter by category or department only, not by brand or a single product (S9).
  - A brand filter on product results needs the exact brand name, because brand names are not sent to the model.
  - Brands that differ only in letter case are kept separate, as in the source data.
  - A compared series cut off at today is compared with a full earlier period; the cut-off note sits beside it (review S-3).
  - TheLook changes daily, so results for a scope can differ slightly between days.
- **Candidates for the opportunity review:** review S-2 (two figures computed in the web), S-3, S-4 ("731 days" counts both periods); a brand-count field in the decision schema (DEC-003 follow-up).

## Workflow friction (actionable only)

- **Stale entries in the implementation notes.** Two findings (W3, W4) were appended as "open" after they had been fixed, which led to a wrong status report at closeout. Action: when a finding is fixed, update its original entry rather than adding a new one.
- **Spec rules that conflict at a limit.** S3 ("the table lists every group") and S10 (brand cap) conflicted for a brand pie; the implementer settled it, and only the review raised it (DEC-004). Action: when writing a spec, check each display rule against the largest dimension (brands).
- **A model habit that prompt wording did not change.** Two prompt attempts did not fix `grp-02`. Action: when a case fails on a schema field the model consistently misuses, consider the schema shape before iterating on prompt text.

## User acceptance

- Accepted by: [pending]
- Date: [pending]
- External CI result: Passed for `c4fc3db` (reported by the user, 2026-11-21)
- Notes: [pending]
