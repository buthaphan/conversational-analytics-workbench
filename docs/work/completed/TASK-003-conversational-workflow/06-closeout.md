# Closeout: TASK-003 Conversational workflow (core, without credentials)

**Status:** Accepted by the user on 2026-11-08. External CI passed for the final commit `c82cdd2`.
**Spec revision:** 1 (approved 2026-11-08)
**Branch:** `feature/TASK-003-conversational-workflow`, pushed. Implementation `f99200b`; review fixes `80434b5` (round 1) and `c82cdd2` (round 2).

## Definition of Done

| Criterion | Status | Evidence |
|---|---|---|
| AC-1 Storage and cleanup | Met | Migration with cascades from `auth_sessions` and `users`. A named cleanup step runs inside the session-end transaction. Tests cover the four end reasons, user deletion, rollback with a failing later step, and 20,000 rows deleted in under 2.5 s. The slow-turn interaction (R1) is deferred to TASK-004 ([DEC-002](DECISION-LOG.md)); it cannot occur with the demo model. |
| AC-2 Capability registry | Met | `registry.test.ts`; `top_count` now bounded (R3) |
| AC-3 TurnDecision validation | Met | Schema tests. Invalid JSON, schema violations, and a model failure give the generic reply with no data access and no state change. Logs contain the error type only. |
| AC-4 First retrieval | Met | Orchestrator and HTTP tests (exactly one retrieval, refinements applied) |
| AC-5 Model context | Met | Leak test for both capabilities, proven by a mutation check; 10-turn window |
| AC-6 Backend enforcement | Met | One orchestrator test per rule (a)–(f), with retrieval counts; inherited scope |
| AC-7 Switch confirmation | Met | Button and reply confirmation, keep, decline, implicit clear, retrieval failure (old result and pending kept). A confirmation with nothing pending changes nothing (R4). A switch confirmed during another message stays consistent. |
| AC-8 Three data layers | Met | Engine and orchestrator tests; clear filters restores the complete set without retrieval |
| AC-9 Analyses and targets | Met | Known-answer tests (ties, even n, empty set); top 10% computed over the complete set while 10 rows are displayed |
| AC-10 Backend-written answers | Met | Template tests; answer text asserted in orchestrator and conversation tests |
| AC-11 Row cap | Met | Over-cap first retrieval stores nothing; over-cap switch keeps the old result |
| AC-12 API | Met | 401, 403, 400 bodies, `no-store`, cross-user isolation, serialized concurrent POSTs. The 200-message limit is enforced and shown in the web app (R2). |
| AC-13 Refresh and session end | Met | HTTP refresh equality; empty analysis after sign-out and sign-in; web restore; return to sign-in on 401. The slow-first-turn refresh (R7) is deferred to TASK-004 (DEC-002). |
| AC-14 Fake adapters | Met | Fixture tests; dependency check (only the module imports adapters); the scripted test model lives outside the build |
| AC-15 Demo model | Met | Phrase mapping for every example; unknown text lists the examples; `ANALYSIS_MODEL=demo` refused in production; web banner and example buttons |
| AC-16 Web workspace | Met | 19 component tests, with axe on six states: live-region announcements (including repeats and the limit), focus kept in the input, keyboard-scrollable conversation panel. The user confirmed 320 px reflow in the browser. |
| AC-17 Scripted conversations | Met | All 12 conversations through the HTTP API, with retrieval counts and state after each turn (driven by the demo model's script; see limitations) |
| AC-18 Manual walkthrough | Met | User, 2026-11-08: every step as expected. The user's layout feedback (the conversation pushed the result out of view) was fixed test-first and confirmed in the browser, together with a 320 px window. |
| AC-19 Docs and CI | Met | README, `example.env`, `compose.yaml`, TASK-004 handover. CI passed for `f99200b`, `80434b5`, and `c82cdd2` (reported by the user). |

Spec Definition of Done:

- [x] Every acceptance criterion is met and supported by evidence.
- [x] Required tests and checks pass, and the results are recorded.
- [x] Review findings are resolved or explicitly accepted by the user (R1 and R7 deferred by DEC-002; R8, R9, and R12 accepted as optional).
- [x] Documentation, the TASK-004 handover, and known limitations are current.
- [x] The user completed the manual walkthrough (AC-18).
- [x] The user accepts closeout (2026-11-08); the external CI state is reported accurately (passed for `c82cdd2`).

## Verification and review

- **Final checks** (2026-11-08, at the round 2 fixes):
  - **API:** 339 tests (26 files). Three consecutive full runs were stable during implementation.
  - **Web:** 311 tests plus 1 deliberately failing self-test (24 files).
  - **Lint, typecheck, format, and both builds** pass.
  - **Clean install:** `npm ci` from scratch, then all checks.
  - **Dependency audit:** runtime 0 vulnerabilities. Development only: 10 moderate, all from the `minimatch` advisory via ESLint (as in TASK-001 and TASK-002 DEC-004). The only dependency added was `zod` (approved).
- **Task review:** two rounds ([05-task-review.md](05-task-review.md)). Each round combined my own read against the spec with an independent reviewer who traced the code without the implementation notes.
  - **Round 1:** no blocking defects. R2–R6, R10, and R11 were fixed in `80434b5`; R1 and R7 were deferred by DEC-002; R8, R9, and R12 were left optional.
  - **Round 2:** all round 1 fixes confirmed. Minor findings: N1 and N3 fixed in `c82cdd2`; N2 recorded in the handover. The N1 test caught that my first fix was in the wrong place: the busy Send button cancels its own activation, so Enter never reached the form. The final fix was confirmed by its test, but not given a third independent review, because the change is small.
  - **Unresolved:** none blocking. The optional items are listed below.
- **External CI:** passed for the final commit `c82cdd2` (reported by the user).

## Limitations and pending decisions

- **Pending decisions:** none. DEC-001 (demo model) and DEC-002 (defer R1 and R7) are approved.
- **Required before the Claude model is enabled (TASK-004):**
  - **R1 and R7:** the turn lock interacts with session end and with refresh; see `TASK-004-HANDOVER.md`, section 4.
  - **N2:** set row caps in the registry only.
  - Real row caps, the BigQuery aggregation matching the reference rules, `ANALYSIS_MODEL=claude`, Claude Max credit applicability, and the Sandbox quotas.
- **Deviations accepted in review:**
  - The 12 scripted conversations use the demo model's script, so the tests and the walkthrough cover the same paths.
  - `ANALYSIS_MODEL=none` is the production default until TASK-004.
  - Table cells are formatted in the browser, using the backend's rules.
  - The fixture has no 2023 data, so conversation 7 only works as "Keep current".
- **Optional, not done:**
  - R8: data-independent checks on a data request's refinement could run before retrieval.
  - R9: unusual view names such as "bar graph" get a contradictory refusal.
  - R12: the demo's "last 12 months" fails on 29 February.
  - No orchestrator-level test for the `top_count` bound; it is covered in the registry tests.
- **Dev-only audit finding:** `minimatch` via ESLint, as before.

## Workflow friction (actionable only)

- **A lock needs a check of every other transaction on the same row.** TD-7's per-turn row lock was approved without looking at the session-end cleanup and the state read, which touch the same row (R1, R7). Action: when a spec adds a lock or a long transaction, list each other code path that reads or deletes that row, and plan a slow-path test.
- **An independent reviewer found what the implementer's tests missed.** Both rounds found real issues: the invisible limit message, the unbounded count, the silently ignored Enter. Action: keep the separate, unanchored review pass for every task.
- **Stale Docker images confused the browser check.** The Docker stack still ran pre-task code while the walkthrough used the dev servers. Action: the walkthrough instructions should name the stack to use, and say to rebuild with `docker compose up --build -d` if using Docker.
- **The local format check is noisy on Windows.** Prettier flags untouched files because the checkout uses CRLF, while CI (LF) passes. Action: consider a `.gitattributes` rule (`* text=auto eol=lf`) in a small housekeeping task.
- **Tooling note:** Prisma 7's `migrate dev` does not regenerate the client; run `npm run db:generate -w api` after schema changes.

## User acceptance

- Accepted by: buthaphan
- Date: 2026-11-08
- External CI result: Passed for `c82cdd2` (2026-11-08)
- Notes: R1, R7 (DEC-002), and N2 are required work in TASK-004 (see the handover). R8, R9, and R12 remain optional. Next: merge `feature/TASK-003-conversational-workflow` into `main` through a pull request, then start TASK-004.
