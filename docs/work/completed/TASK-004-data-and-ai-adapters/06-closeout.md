# Closeout: TASK-004 Real data and AI adapters

**Status:** Accepted by the user on 2026-11-08. External CI passed for the final commit `4abd36b` (reported by the user).  
**Spec revision:** 1 (approved 2026-11-08)  
**Branch:** `feature/TASK-004-data-and-ai-adapters`, pushed. Spec `bf2675e`; implementation `9e8e8c9`; review fixes `4abd36b`.

## Definition of Done

| Criterion | Status | Evidence |
|---|---|---|
| AC-1 Two-phase turn | Met | `turn-lock.http.test.ts`: sign-out, sign-in elsewhere, and idle expiry during a slow turn; refresh during a first turn; 409 for a concurrent message or Switch; stale takeover; marker cleared on every failure path; a late turn after the deadline is discarded (round 2). TASK-003 R1 and R7 are fixed. |
| AC-2 Turn in progress (web) | Met | `Workspace.test.tsx`: notice, disabled controls, polling, 409 handling, 401 stop, deadline, and the "not answered" message when a turn expires (review R1). |
| AC-3 Configuration | Met | `config.test.ts`; `example.env` placeholders. |
| AC-4 Adapter wiring | Met | `analysis.module.test.ts`; `dependencies.test.ts` (mutation-checked). |
| AC-5 TheLook profile | Met | [THELOOK-PROFILE.md](../../../product/THELOOK-PROFILE.md). The date window uses the order date (decided from the profile). |
| AC-6 BigQuery adapter | Met | `bigquery-data-source.test.ts`, including the DATE-parameter fix found by the live run. |
| AC-7 Known-answer check | Met | Live: 10 of 10, exact match on two scopes with all statuses; 12 rows checked by hand. |
| AC-8 Row caps | Met | 50,000 per capability, set in the registry only; store and cleanup at the cap measured. |
| AC-9 Claude adapter | Met | `claude-llm-client.test.ts`: request content, schema, limits, stop reasons, tag neutralising. |
| AC-10 Model evaluation | Met | 37 of 37 (safety 9 of 9) in two full runs; baseline `api/src/live/eval/baseline.claude-sonnet-5-5.json`. |
| AC-11 Credential-free CI, no secret exposure | Met | CI passed for `9e8e8c9` and `4abd36b`; live suites outside `npm test`; bundle and secret scans clean. |
| AC-12 Real conversation | Met | User walkthrough, 2026-11-08. |
| AC-13 Docs | Met | README (setup, configuration, cost, live checks), `example.env`, this closeout (handover items below). |

Spec Definition of Done:

- [x] Every acceptance criterion is met and supported by evidence.
- [x] Required tests and checks pass, and the results are recorded.
- [x] The known-answer check and the evaluation threshold are met; the baseline is stored.
- [x] Review findings are resolved or explicitly accepted by the user (R1, S1–S4, and N1–N5 fixed; R2 and N6 accepted).
- [x] Documentation, the profile, and known limitations are current.
- [x] The user completed the manual walkthrough (AC-12).
- [x] The user accepts closeout (2026-11-08); the external CI state is reported accurately (passed for `4abd36b`).

## Verification and review

- **Final checks** (after round 2, 2026-11-08):
  - `npm run lint`, `npm run typecheck`, and `npm run build` exit 0.
  - `npm test`: API 32 files, 428 passed; web 24 files, 333 passed plus 1 deliberately failing self-test.
- **Live checks:** profile 14 of 14 queries; known-answer 10 of 10; evaluation 37 of 37 twice. Model spend for the task: about $0.20.
- **Dependencies:** `@anthropic-ai/sdk` ^1.6.0 and `@google-cloud/bigquery` ^9.6.0 (DEC-003). Runtime audit: 0 vulnerabilities. Development only: the existing `minimatch` advisory via ESLint.
- **Task review** ([05-task-review.md](05-task-review.md)): two rounds, each with my own read plus an independent reviewer who did not see the implementation notes.
  - **Round 1:** no blocking defects. R1 was fixed (AC-2), R2 accepted, S1–S4 done.
  - **Round 2:** N1 (an expired turn could save late) and N2–N5 were fixed; N6 accepted.
- **External CI:** passed for the final commit `4abd36b` (reported by the user).

## Decisions

- **DEC-001:** two-phase turn; a message during a running turn gets 409.
- **DEC-002:** Claude runs live calls after the user's approval of each run.
- **DEC-003:** official SDKs.
- **DEC-004:** walkthrough layout changes:
  - navy header with a logo-only heading and a light logo variant;
  - compact summary;
  - a chart that fills the window, and dense, framed, scrolling tables;
  - the conversation column matching the result column.

  A one-step-smaller type scale was tried and reverted.
- **DEC-005:** review decisions.
- Billing is Console prepaid API credit; the Claude Max assumption does not apply. Server-side refusal fallback is kept on.

## Limitations and pending decisions

- **Pending decisions:** none.
- **Known limitations:**
  - **R2:** a sign-out during the few seconds a very large result is being saved (phase C) can time out cleanup. The data is never exposed and the sweeper deletes it within about a minute. Unlikely at current sizes (largest 1-year scope about 14,000 rows). Revisit with the AWS work, where the option is to store rows before the locked step.
  - **Abandoned-turn window:** after a crash or hang, new messages get "still answering" for up to 2 minutes, until the turn marker expires.
  - **N6:** after the web app's own deadline (a stall with failed polls), a retry can restore the state without the "not answered" message. Rare.
  - **Unexplained walkthrough failure:** one turn failed during the walkthrough and its marker expired. The API logs were not available. Not reproduced. The new error filter now logs the class and route if it recurs.
  - **TheLook changes daily** (new and future-dated rows), so results for a scope can differ slightly between days.
  - **Evaluation coverage:** 37 single-turn cases; multi-turn behavior was checked manually only.
  - **Docker Compose** keeps the demo model and fixture; the real adapters run with the npm dev servers.
  - The Sandbox limits in the profile are quoted from the architecture proposal, not re-verified online.
- **TASK-003 handover items:** R1 and R7 fixed (AC-1); N2 done (caps set only in the registry, the option can only lower them); real caps, the known-answer check, `ANALYSIS_MODEL=claude`, billing, and Sandbox use are all done. Nothing is carried over.
- **Disclosure:** `npx tsx` was fetched into the npx cache from the network without asking (notes, step 10); nothing was added to the project.

## Workflow friction (actionable only)

- **Live checks find what fakes cannot.** Both the BigQuery DATE-parameter bug and the structured-output schema limit were invisible to unit tests with fakes. Action: for a new external adapter, plan one cheap live smoke call early, before the full suite of fakes is finished.
- **A test mock that the real API can never produce hides defects.** The original AC-2 deadline test mocked `turnInProgress: true` forever (review R1). Action: build polling and wait mocks from the server's real state transitions.
- **Check the user's environment first.** The first walkthrough attempt ran the demo model because `.env` lacked the new settings, and later screenshots were taken at browser zoom. Action: walkthrough instructions should list the exact `.env` lines, and ask for zoom at 100%.
- **Formatting tools touched approved documents.** Prettier re-padded the tables in the approved spec, plan, and design-system doc; these were restored. Action: format only the files being changed, never the approved task documents.

## User acceptance

- Accepted by: buthaphan
- Date: 2026-11-08
- External CI result: Passed for `4abd36b` (reported by the user, 2026-11-08)
- Notes: Accepted as complete with the known limitations above. Next: move the task folder to `docs/work/completed/`, commit, and open the pull request into `main`. The next task is not chosen yet; candidates (more capabilities with line and pie charts, UI polish, the AWS showcase with the hardening items) go through an idea record first.
