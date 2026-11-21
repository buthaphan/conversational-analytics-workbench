# Implementation plan: TASK-005 Sales trends and group performance

**Spec revision:** 3 (approved 2026-11-15; DEC-001 affects steps 10 and 14; DEC-002 affects step 4)  
**Status:** Approved for implementation

| Step | Behavior / change | Acceptance criteria | Test-first step | Dependencies |
|---|---|---|---|---|
| 1 | Extend the profiling script (department, brand, daily sales, new query bytes); **approved live run**; update the profile and confirm the caps | AC-1 | — (live run; queries committed first) | User approval |
| 2 | Product rows gain `department` and `brand`: registry fields, fixture products, BigQuery query and mapping | AC-2 | Fixture and adapter tests expect the new fields and the null-brand rule → red | 1 |
| 3 | Brand values left out of the model context; backend-only brand filter validation | AC-2 | Model-context test with many brands asserts none appear → red | 2 |
| 4 | Decision schema: `request_data.parameters`, `refinement.group_by`, new view names; registry validation of time-series parameters and interval defaults | AC-3, AC-12 | Schema and registry tests for each parameter, default, and boundary → red | — |
| 5 | **Approved smoke call:** one Claude request with the extended schema, to catch structured-output limits early | AC-12 | — (live) | 4, user approval |
| 6 | `sales_time_series` retrieval: fixture daily aggregation; BigQuery query with filter and comparison parameters; shared zero-fill, today cut-off, and baseline dates | AC-4 | Fixture, adapter, and pure date tests → red | 4 |
| 7 | Engine: roll-up to day/week/month, partial flags, measure, comparison alignment, period totals | AC-5 | Engine integration tests on stored daily rows → red | 6 |
| 8 | Orchestrator: time-series load, same-data/switch rules with parameters, switch question wording | AC-6 | Orchestrator tests for each parameter difference → red | 6, 7 |
| 9 | Time-series refinements and analyses: allowed set, refusals, summary naming lowest and highest bucket | AC-7 | Orchestrator tests for allowed and refused requests → red | 8 |
| 10 | Grouped view: `group_by` in view settings, engine grouping with filters first, brand top-N, "Other"; remove the `group` analysis | AC-8 | Engine and orchestrator tests → red; update existing group tests (noted) | 2 |
| 11 | Views and chart rules: view × shape matrix, pie top-5 + "Other", defaults per shape | AC-9 | Orchestrator matrix tests → red | 8, 10 |
| 12 | Answer templates for series, comparison, grouping, pie, refusals | AC-10 | `answers.test.ts` cases → red | 7, 10, 11 |
| 13 | Catalogue text, model-context analyses list, demo-model examples | AC-12 | Model-context and demo-model tests → red | 4, 10 |
| 14 | Web: `ChartWithTable` gains horizontal bar, pie, and multi-series line; result area per shape; period totals; scope summary; API types | AC-11 | Web component and axe tests per view → red | 7–12 (API shape) |
| 15 | Known-answer check extended; **approved live run**; hand checks | AC-13 | — (live) | 2, 6, user approval |
| 16 | Evaluation cases added and updated; **approved run**; new baseline | AC-14 | `cases.test.ts` validates the new cases → red | 4, 13, user approval |
| 17 | Docs: catalogue, design system, README | AC-17 | — (inspection) | 11, 14 |
| 18 | Full verification; user walkthrough | AC-15, AC-16 | — | All |

## Verification sequence

1. During each red/green cycle, run only the focused test file(s) for that step.
2. After step 14: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` once; format only changed files (never the approved task documents).
3. Live runs (steps 1, 5, 15, 16) each after the user's approval; results in `03-implementation-notes.md`.
4. Walkthrough (step 18), with the exact `.env` lines listed and browser zoom at 100% (TASK-004 friction note).

## Risks / coordination

- **Engine shape change:** the engine and web views assume entity rows sorted by a measure. Time series and groups add two shapes; keep the shape-specific rules in the registry and engine so the orchestrator stays a dispatcher.
- **Schema limits:** the TASK-004 structured-output limit could be hit by the new optional parameters; step 5 checks it before most of the work depends on it.
- **Evaluation drift:** more capabilities and views change the prompt; all 37 existing cases are rerun with the new ones. If the threshold is missed, diagnose the catalogue text first; a threshold change needs the user's decision.
- **Brand count:** if the profile shows far more brands than expected, or many nulls, the S10 cap or null label is revisited with the user before step 10.
- **Removed `group` analysis:** existing sessions with group cards are short-lived (deleted at sign-out), so no data migration; the web drops the group card.
