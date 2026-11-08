# Task review: TASK-004 Real data and AI adapters

**Reviewed:** `bf2675e..9e8e8c9` (65 files, +5,451 / −344) against [01-spec.md](01-spec.md) revision 1, [02-implementation-plan.md](02-implementation-plan.md), [DECISION-LOG.md](DECISION-LOG.md) (DEC-001 to DEC-004), and [03-implementation-notes.md](03-implementation-notes.md).
**Date:** 2026-11-08 (round 1)
**Method:**

- My own read against each criterion and the recorded evidence.
- An independent reviewer who traced the code without the implementation notes and ran the focused API and web suites locally (all passed).
- External CI for `9e8e8c9`: passed (reported by the user).

## Summary

No blocking defects. Two should-fix findings:

- **R1** makes one clause of AC-2 (the deadline retry message) effectively unreachable, so AC-2 is **unmet** until it is fixed.
- **R2** is a residual of the turn-lock problem in a narrow window (phase C), and needs a decision: fix, or accept as a known limitation.

Four suggestions are optional.

## Findings

### R1. Should-fix: the "taking longer than expected" retry message never appears against the real API (AC-2)

- **Where:** `web/src/analysis/Workspace.tsx` (polling effect, about lines 96–133), together with `api/src/analysis/orchestrator/orchestrator.ts` (`isStale`, `TURN_DEADLINE_MS`).
- **Scenario:**
  - The server reports `turnInProgress: false` as soon as the marker is 120 s old, measured from `turnStartedAt`.
  - The web app's 120 s deadline starts later: when it begins waiting, after a refresh or a 409.
  - So after a crashed or hung turn, the server's deadline always passes first. The poll then sees `turnInProgress: false`, treats the turn as answered, stops, and shows the old state. The user's message is gone, with no reply, no retry message, and no announcement.
  - The `stalled` branch only runs if every poll fails for 120 s.
- **Why the test passes:** the AC-2 "deadline reached" test mocks `turnInProgress: true` forever, which the real API never returns.
- **Verified** by reading both sides: the client's `if (next.turnInProgress) return; stop(); setState(next)` path, and the server's `isStale`.
- **Relation to the walkthrough:** this is consistent with the unexplained walkthrough failure in the notes, where a stuck marker expired silently, although that first error came from the send itself.
- **Suggested fix:**
  - Have the client detect that the turn ended without an answer: polling stopped, and no new assistant message arrived since waiting began. Show the retry message and keep the user's text.
  - Or have the API report an expired, abandoned turn explicitly, for example `turnAbandoned: true` once, or an outcome message.
  - Add a test with a mock that switches from `turnInProgress: true` to `false` with no new message.

### R2. Should-fix (needs a decision): a sign-out during phase C can push cleanup past its 5 s transaction

- **Where:** `orchestrator.ts` (`SAVE_TRANSACTION`, phase C `save`) and `api/src/sessions/session.store.ts` (`finishEnded`, default 5 s transaction).
- **Scenario:**
  - Phase C holds the analysis-session row lock while it inserts the result rows: 3.4–5.5 s locally for the 50,000-row cap.
  - A sign-out, a sign-in elsewhere, or a sweep at that moment waits on the lock inside cleanup's 5 s transaction. It may time out, especially on slower hosted databases.
  - The token is still rejected, because `endedAt` is committed first, and the data is never accessible. But the analysis data remains until the sweeper retries (within about a minute).
- **Test gap:** AC-1 required and tested only sign-out during phase B; no test covers phase C.
- **Already recorded:** this is the "known limitation" in the implementation notes. Today's largest 1-year scope is about 14,000 rows, which stores in about 1.5 s, so it is unlikely in practice.
- **Options:**
  1. **Accept:** keep it as a documented limitation, since the data is never exposed and the sweeper retries, and revisit for the AWS showcase.
  2. **Fix:** insert the rows in phase B into a result set that is not yet active, in its own short transactions, so phase C only switches the active pointer. This needs cleanup of orphaned sets if phase C is discarded, plus a phase-C sign-out test.
  3. **Lower the cap** (for example to 30,000), which still covers every 5-year scope measured.
- **Recommendation:** option 1 now, with the limitation carried into the closeout. Option 2 belongs with the AWS work, where database latency is real.

### Suggestions (optional, non-blocking)

- **S1. Demo-mode layout:** with a result shown in demo mode, where the window-height minimum is off, the conversation column follows a possibly short result column. A filtered table of 0–3 rows can squeeze the history panel and let the input overflow. Fix: give the conversation wrapper a minimum height (for example `lg:min-h-[28rem]`). Development only. (`Workspace.tsx`)
- **S2. Unexpected 500s are logged by Nest's default handler** with `error.message` and the stack. A Prisma validation error in phase C could include message text or row values. This pre-dates this branch and is unlikely with the current types. Fix: a global exception filter that logs the error class name only, matching the spec's logging rule.
- **S3. Claude stop reasons:** only `refusal` and `max_tokens` throw. Another truncating stop reason, such as a context-window stop, still fails safely as an invalid decision but is not reported as "truncated". The user text is placed inside `<user_message>` without neutralising a closing tag. The output is validated, so the impact is low.
- **S4. The discarded turn's 409 says "still answering"** after a stale takeover, when it was actually dropped. Cosmetic; the client behaves correctly.

## Acceptance criteria

| AC                                           | Status                                                                                                           | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-1 Two-phase turn                          | **Met**                                                                                                          | `turn-lock.http.test.ts` (13): sign-out, sign-in elsewhere, and idle expiry during phase B; refresh during a first turn in under 1 s; 409 for a message and for Switch; stale takeover; marker cleared on all five failure paths. TASK-003 concurrency tests updated per DEC-001. The reviewer confirmed phase C cannot recreate data and the lock order cannot deadlock. Residual: R2 (phase C, not required by AC-1). |
| AC-2 Turn in progress (web)                  | **Unmet** (one clause)                                                                                           | Notice, disabled controls, 2 s polling, 409 handling, and 401 stop are met (`Workspace.test.tsx`, axe). The "after the turn deadline, shows a retry message" clause does not occur against the real API (R1).                                                                                                                                                                                                           |
| AC-3 Configuration                           | **Met**                                                                                                          | `config.test.ts` (+11): values, defaults, production refusals, required credentials, no secret in messages. `example.env` holds placeholders only.                                                                                                                                                                                                                                                                      |
| AC-4 Adapter wiring                          | **Met**                                                                                                          | `analysis.module.test.ts`; `dependencies.test.ts` with mutation check (notes, step 7).                                                                                                                                                                                                                                                                                                                                  |
| AC-5 TheLook profile                         | **Met**                                                                                                          | `docs/product/THELOOK-PROFILE.md` and `profile.live.ts` (14 queries). The Sandbox limits are quoted from the architecture proposal and marked as not re-verified online.                                                                                                                                                                                                                                                |
| AC-6 BigQuery adapter                        | **Met**                                                                                                          | `bigquery-data-source.test.ts` (14, including `sdkParams` added after the live run found the DATE-to-NULL bug). The reviewer confirmed the SQL matches the reference rules.                                                                                                                                                                                                                                             |
| AC-7 Known-answer check                      | **Met**                                                                                                          | Live run 10 of 10, exact equality on two scopes with all five statuses; 12 rows checked by hand (notes, step 8).                                                                                                                                                                                                                                                                                                        |
| AC-8 Row caps                                | **Met**                                                                                                          | Registry caps 50,000 with rationale; the option can only lower a cap; storing at the cap took 5.5 s (under 30 s); cleanup took 31 ms (under 5 s).                                                                                                                                                                                                                                                                       |
| AC-9 Claude adapter                          | **Met**                                                                                                          | `claude-llm-client.test.ts` (11): exact request content, limits, caching, schema conversion (including the 24-optional-parameter limit), errors. Suggestion S3.                                                                                                                                                                                                                                                         |
| AC-10 Model evaluation                       | **Met**                                                                                                          | Runs 2 and 3: 37 of 37 overall, safety 9 of 9; baseline saved; offline harness check `cases.test.ts`.                                                                                                                                                                                                                                                                                                                   |
| AC-11 Credential-free CI, no secret exposure | **Met**                                                                                                          | CI passed for `9e8e8c9` (user); live suites outside `npm test`; web bundle grep clean; a secret scan of all 65 files found only deliberate fakes and placeholders.                                                                                                                                                                                                                                                      |
| AC-12 Real conversation (manual)             | **Met**                                                                                                          | User confirmation, 2026-11-08: "everything is working as expected". The individual walkthrough steps were not itemised by the user. Latency and cost come from the live checks.                                                                                                                                                                                                                                         |
| AC-13 Docs                                   | **Met** for README and `example.env`. Carrying the TASK-003 handover items into the closeout is a closeout task. |

## Tests and process

- Only one test was removed (the HTTP concurrent-POST test), replaced under DEC-001. The other changed tests kept or gained cases. The loosened concurrency assertions still check that results stay consistent.
- Test-first evidence is recorded for each step. Exceptions are disclosed in the notes: one model-context test was written after the change; the `npx tsx` fetches happened without asking.
- The live runs caught two real bugs that the unit tests could not see (DATE parameters sent as NULL; the structured-output schema's optional-parameter limit). Both were fixed test-first.
- DEC-004 layout work changed shared components (`Card`, `Table`, `ChartWithTable`) with new opt-in options; the defaults are unchanged and the design-system tests pass.

## Recommendation

**Return to implementation for R1** (small, web-only, restores AC-2). **Pending user decision on R2** (recommended: accept as a documented limitation and revisit for AWS). S1–S4 are optional. After R1, re-run the web suite and CI; then closeout.

## Round 1 resolution (2026-11-08)

User decisions ([DEC-005](DECISION-LOG.md)): fix R1; accept R2 as a known limitation; do S1–S4. Fixes and test-first evidence: [03-implementation-notes.md](03-implementation-notes.md#review-round-1-fixes-05-task-reviewmd-dec-005).

## Round 2 (fixes re-reviewed)

**Method:** an independent reviewer read the uncommitted fix diff and ran the focused suites (API 31/31, `Workspace.test.tsx` 31/31, full API without live suites 405/405).

**Verified correct:**

- R1 does not fire on first load, after a normal answer, or after a `turn_in_progress` wait that ends with an answer; the effect does not restart mid-wait.
- S1 applies only when the column fills.
- S2 leaves HTTP exceptions (400/401/403/409/429 bodies, `Retry-After`) and errors before routing unchanged, and writes the 500 only if headers are unsent.
- S3 maps the stop reasons as intended.
- S4 never clears a newer turn's marker.

**New findings and their resolution:**

| ID  | Severity   | Finding                                                                                                                                          | Resolution                                                                                                                                                    |
| --- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1  | Should-fix | An expired turn that nobody took over could still save its answer, after the web app had already said "not answered", so a resend duplicated it. | Fixed test-first: phase C rejects a stale claim (`TurnExpiredError`, a 409 `turn_superseded`) and clears its own marker. New turn-lock test: red, then green. |
| N2  | Suggestion | After a `turn_superseded` 409 the tab did not show the newer turn's result.                                                                      | Fixed: a quiet state refresh after the message. The S4 web test now also checks that the newer conversation appears.                                          |
| N3  | Suggestion | "Took too long" was inaccurate for a fast failure.                                                                                               | Fixed: neutral wording, "Your last message wasn't answered. Please send it again." (API and web).                                                             |
| N4  | Suggestion | Logging only the class name is hard to trace.                                                                                                    | Fixed: the method and route pattern are logged (for example `POST /api/analysis/messages`), with no URL values, query, or body. Asserted in the filter test.  |
| N5  | Suggestion | A `</user_message foo>` variant was not neutralised.                                                                                             | Fixed: a broader pattern, with the test extended.                                                                                                             |
| N6  | Suggestion | Stall, then retry, can restore silently if the server turn also expired.                                                                         | Left as is: rare, because polling every 2 s normally sees the server's expiry first. Recorded as a limitation.                                                |

**Verification after round 2:** `npm run lint`, `npm run typecheck`, and `npm run build` exit 0. `npm test`: API 32 files, 428 passed; web 24 files, 333 passed plus 1 deliberately failing self-test. External CI for the fix commit: pending (the user pushes).

## Criteria after the fixes

AC-2 is now **met**: the deadline/expiry case shows the retry message, tested against the real API's expiry behavior. All of AC-1 to AC-13 are met; AC-11 for the fix commit awaits its CI run.

## Final recommendation

**Closeout**, after the user commits and pushes the fixes and CI passes. Known limitations to carry into the closeout:

- R2 (accepted)
- N6
- the unexplained walkthrough failure (notes, step 12)
- the stale-marker window: an abandoned turn blocks new messages for up to 2 minutes
