# Implementation plan: TASK-004 Real data and AI adapters

**Spec:** [01-spec.md](01-spec.md) revision 1. Each step is test-first: write the failing test, confirm the expected failure, make it pass, refactor. Steps 1–4 need no credentials or network.

| Step | Work | Criteria | Depends on |
|---|---|---|---|
| 1 | **Lock inventory.** List every code path that reads, locks, or deletes the `analysis_sessions` row (turn, `getState`, context build, cleanup step, cascades, sweeper) and record it in the notes (TASK-003 retrospective). | AC-1 | — |
| 2 | **Two-phase turn.** Migration for the turn marker. Tests first with a gated slow fake model and data source: session end, replacement sign-in, and refresh during phase B; 409 for a second message and Switch; stale takeover; marker cleared on every failure path; phase C discards after session end and never upserts. Then split `turn()` into phases A/B/C: the decision is planned on the phase-A snapshot (the marker guarantees no other turn changes it), the fetch runs in B, all writes in C. Update the TASK-003 concurrent-POST test (DEC-001). `turnInProgress` in the state. | AC-1 | 1 |
| 3 | **Web in-progress handling.** Component tests, then the notice, disabled controls, 2 s polling, 409 handling, 401 and deadline stops. | AC-2 | 2 |
| 4 | **Config and wiring.** Config tests, then `ANALYSIS_MODEL=claude`, `DATA_SOURCE`, required credentials, `ANTHROPIC_MODEL`, production rules; extend `dependencies.test.ts`; module wiring per combination; `example.env`. | AC-3, AC-4 | — |
| 5 | **Install SDKs** (DEC-003): ask the user to approve the `npm install` for `@anthropic-ai/sdk` and `@google-cloud/bigquery`; record versions and the audit. Add `live:*` scripts and a separate Vitest config for live suites, excluded from `npm test`. | AC-11 | 4 |
| 6 | **Profile TheLook** (live, approved): profiling script with committed queries; write `THELOOK-PROFILE.md`; confirm the date-window timestamp. | AC-5 | 5, user GCP setup |
| 7 | **BigQuery adapter.** Unit tests with a fake client (parameterization, cap, timeout, location, type mapping, errors, over-cap guard), then the two queries and the adapter. | AC-6 | 5, 6 |
| 8 | **Known-answer check and row caps** (live, approved): extract-based live test; hand checks; set registry caps from the profile; timed store and cleanup test at the cap. | AC-7, AC-8 | 2, 7 |
| 9 | **Claude adapter.** Load the `claude-api` reference first. Unit tests with a fake transport (request content, leak test, limits, caching, error cases), then the adapter. **Before the first live call:** billing confirmed by the user. | AC-9 | 4, 5 |
| 10 | **Evaluation** (live, approved per run): evaluation set and runner; iterate the system prompt (never the schema or backend rules) until the threshold is met; store the baseline. | AC-10 | 9 |
| 11 | **Docs and verification:** README, `example.env`; full API and web suites, lint, typecheck, format, builds, audit; live test results; bundle grep. | AC-11, AC-13 | 1–10 |
| 12 | **Manual walkthrough** by the user with measurements. | AC-12 | 11 |

**Notes**

- Live runs (steps 6, 8, 10) each need the user's approval at the time (DEC-002). Credentials are read by the SDKs from the environment only.
- If profiling contradicts the reference rules (for example, statuses or price precision), stop and raise a decision before changing the rules.
- Step 10 must not change validation or enforcement to make cases pass; a failing case is fixed in the prompt or recorded as a known limitation.
