# Task review: TASK-003 Conversational workflow

**Reviewed revision/diff:** `71f3e96..f99200b` on `feature/TASK-003-conversational-workflow` (round 1). The uncommitted note updates recorded CI and the clean install.
**Spec revision:** 1 (approved 2026-11-08)
**Method:** two passes.
- **Spec pass:** my own read of the spec, the plan, the notes, and the tests against each criterion.
- **Independent pass:** a fresh reviewer read the code with no access to the implementer's reasoning and traced each finding through the code.

I then checked the findings myself. R2, R3, and R4 are confirmed in the code. R1 and R7 were traced, not reproduced, because they only appear with turns slower than the demo model.

## Findings

No finding is blocking. The core safety properties hold:
- **SQL:** field names come only from the registry and must match `^[a-z_]+$`, and every value is a bound parameter. No injection path was found.
- **Model context:** it never reads assistant text, cards, or rows.
- **Isolation:** the analysis session comes from the session cookie, never from the request.
- **Failure cases:** an invalid decision changes nothing, and a failed retrieval keeps the old result and the pending switch.

| ID | Severity | Finding | Location | Required action |
|---|---|---|---|---|
| R1 | Medium (latent until TASK-004) | **A running turn blocks session end.** A turn holds the analysis-session row lock for its whole length (up to 120 s, including the model call and the retrieval). The session-end cleanup deletes that row inside `finishEnded`'s transaction, which has Prisma's default 5 s timeout. A turn longer than about 5 s plus a sign-out or idle expiry makes the cleanup time out. The session is still marked ended, so access stops, but the analysis data stays until the sweeper retries (AC-1 timing). If the user signs in elsewhere during a turn of about 25 s or more, all five `create()` attempts fail and the sign-in returns `SessionUnavailableError`. The demo model and the fixture are instant, so this cannot happen today. | `orchestrator.ts` `TURN_TRANSACTION` and `turn()`; `sessions/session.store.ts` `finishEnded` | Fix now or defer to TASK-004 by decision. Options: release the lock before the model call (re-check the facts after it), or give cleanup a lock wait longer than the turn. If deferred, add it to the TASK-004 handover. |
| R2 | Medium | **The message-limit reply is invisible.** At the 200-message limit, `turn()` returns `ANSWERS.messageLimit` without storing a message. The web app shows replies only through `state.messages`, so the typed question disappears and nothing appears on screen; only the screen-reader live region gets the text. AC-12's "a message asks the user to sign out and in" is not visible. | `orchestrator.ts` `turn()` (limit branch); `web/src/analysis/Workspace.tsx` `run()` | Show the limit to the user: an inline notice from the reply, or a limit flag in the state. Keep the input text. Add a web test. |
| R3 | Medium | **A huge `top_count` causes HTTP 500 instead of a clarification.** `validateAnalysis` checks only that `top_count` is a whole number of at least 1. A model value such as `1e20` passes, then fails the `::bigint` cast in SQL. The turn rolls back, including the user's message, and the user sees "Could not send". AC-2 requires invalid values to be rejected with a reason. | `capabilities/registry.ts` `validateAnalysis`; `engine/result-engine.ts` `concentration` | Add an upper bound (for example the row cap, or `MAX_SAFE_INTEGER`), plus a registry test and an orchestrator test. |
| R4 | Low | **A confirmation with nothing pending clears a pending clarification.** When nothing is pending, `confirm_switch` returns `pending: null`. So **Switch**, **Keep current**, or a "yes" while a clarification is pending wipes it. AC-7 says a confirmation with nothing pending "changes nothing". The test checks only the reply text. | `orchestrator.ts` `apply()`, `confirm_switch` branch | Leave `pending` unchanged in that branch, and assert it in the test. |
| R5 | Low | **New typing is erased when a reply arrives.** `run()` compares the sent text with `text` from the closure, which is always the sent text, so anything typed while waiting is erased. Also, pressing Enter while a reply is pending is silently ignored. | `Workspace.tsx` `run()` | Clear the input when sending, or compare with the current value. Consider a hint while busy. |
| R6 | Low | **A repeated reply is not announced.** Setting the live region to the same text again (for example "Sorry, I couldn't process that…" twice) does not change the page, so screen readers stay silent (AC-16). | `Workspace.tsx` announcer | Make each announcement distinct (clear it first, or key it by message sequence). |
| R7 | Low (latent until TASK-004) | **A refresh during the first turn can fail to load.** `getState` inserts the analysis session with `ON CONFLICT DO NOTHING` in a transaction with the default 5 s timeout. During the first turn, the turn's own insert has not committed yet, so the GET waits for it. With a turn longer than 5 s, a refresh shows "Could not load your analysis" (AC-13). | `orchestrator.ts` `getState` / `loadFacts` | Handle it together with R1. If deferred, note it in the handover. |
| R8 | Low | **A data request's refinement is checked only after retrieval.** Checks that don't depend on the new data (unknown or non-numeric sort field, limit out of range, unknown filter field) could run first. After a retrieval, an invalid refinement drops all requested refinements, the valid ones too. The reply then asks a question, but the outcome has no pending clarification. | `orchestrator.ts` `requestData()` / `load()` | Validate the data-independent parts before proposing a switch or retrieving. Record the clarification as pending. |
| R9 | Low | **An unrecognised view name gives a contradictory refusal.** Only names ending in "chart" are normalised, so `view: "bar graph"` yields "Bar graph charts aren't available yet. I can show this as a bar chart or a table." | `orchestrator.ts` `changeView()` | Normalise common synonyms (graph, bars), or use a neutral template. |
| R10 | Low (test gaps) | **Planned test cases missing.** (a) Going over the row cap during a confirmed switch: the old result must stay (the AC-11 test plan says "keeps the old result"). (b) The concurrency case planned in the spec: "a switch confirmed while another message arrives". (c) Web: no axe check for the error and analysis-card states; no test for the message-limit state. | Orchestrator, HTTP, and web tests | Add the tests. |
| R11 | Low (accessibility) | **The example buttons sit inside a status region.** The demo banner is an `Alert` with `variant="info"`, which renders `role="status"`, and it contains the example buttons. A live region with interactive controls can be announced noisily. | `Workspace.tsx` demo banner | Put the examples outside the `Alert` (keep the banner text inside), or use a non-live container. |
| R12 | Info | **The demo's "last 12 months" fails on 29 Feb** (builds "2025-02-29", which then gets a date clarification). Demo only. | `llm/demo-llm-client.ts` `trailingYear` | Optional. |

## Acceptance criteria

| Criterion | Status | Evidence or gap |
|---|---|---|
| AC-1 | Met (see R1 for TASK-004) | `analysis-cleanup.test.ts`: all four end reasons, rollback with a failing later step, 20,000-row timing. `analysis-schema.test.ts`: constraints and user deletion. |
| AC-2 | Met with a gap | `registry.test.ts` (28 tests). R3 is an unbounded value that escapes validation. |
| AC-3 | Met | `turn-decision.test.ts`; orchestrator tests for invalid JSON, schema violation, and a model that throws (generic reply, no data access, pending kept). Logs contain only the error type, by inspection; no test asserts the log content. |
| AC-4 | Met | Orchestrator "retrieves on the first request"; HTTP test with exactly one fetch. |
| AC-5 | Met | Leak test for both capabilities, plus the mutation check recorded in the notes; 10-turn window test. |
| AC-6 | Met | One orchestrator case per rule, with fetch counts: (a) refine/analyse/view on the active result, (b) unknown field and disallowed value, (c) a different capability or scope, (d) missing scope, (e) unrelated, unknown capability, and no active result, (f) the same capability and scope treated as a refinement. Inherited scope tested. R8 is a refinement-ordering weakness inside (b)/(c). |
| AC-7 | Partially unmet (R4) | All paths are tested: Switch button, confirm by reply, Keep, decline, implicit clear, retrieval failure (old result and pending kept). But a confirmation with nothing pending clears a pending clarification, against "changes nothing". |
| AC-8 | Met | Engine tests, plus orchestrator refine and clear-filters tests; `rowCount` and `filteredCount` in the state. |
| AC-9 | Met | Known-answer engine tests (ties, even n, empty set). Conversation 4: the complete set is used while 10 rows are displayed, and the view is unchanged. |
| AC-10 | Met | Template tests; the orchestrator and conversation tests assert the template text. Browser formatting of cells follows the same rules (notes, limitation 3). |
| AC-11 | Met for a first retrieval; over-cap switch unverified | Over-cap first retrieval stores nothing (tested). By code reading, an over-cap switch returns before any insert, so the old result stays, but no test covers it (R10a). |
| AC-12 | Partially unmet (R2) | HTTP tests: 401, 403, 400 bodies, `no-store`, isolation, serialized concurrent POSTs, limit text in the API reply. The limit message is not visible in the web app. |
| AC-13 | Met | HTTP refresh equality; sign-out then sign-in starts empty; web restore test; AuthApp returns to sign-in on a 401. R7 is latent. |
| AC-14 | Met | `fixture-data-source.test.ts`; `dependencies.test.ts`; the scripted test model lives in `src/test`, which the build excludes. |
| AC-15 | Met | Phrase-mapping tests for every example; unknown text; config refusal in production (the API loads config at startup); web banner and example tests. |
| AC-16 | Met with gaps | `Workspace.test.tsx` (13 tests) covers each listed state; axe runs on three states. Gaps: R5, R6, R11. The 320 px reflow is by design (one column below `lg`, tables scroll in their region) and the walkthrough was on desktop, so a narrow-screen check is unverified. |
| AC-17 | Met | `conversations.http.test.ts`: 12 conversations, with the fetch count and state checked after each turn. Driven by the demo model's script (notes, deviation 1). That meets the "scripted model" intent and keeps the tests identical to the walkthrough. |
| AC-18 | Met | The user reported every step as expected (2026-11-08). The user raised the conversation-panel layout; it was fixed test-first, and the user still needs to look at it. |
| AC-19 | Met | README, `example.env`, `compose.yaml`, TASK-004 handover. CI passed for `f99200b` (reported by the user). Clean install and `npm audit` recorded (production 0; 10 moderate warnings in the lint tools only). |

## Tests and quality

- **Strengths:**
  - The tests assert behavior: fetch counts, stored rows, pending state, and template text.
  - Two mutation checks (the leak test and the row lock) show that key tests fail when the protection is removed.
  - The repeated runs (3×) were stable.
- **No weakened tests found.** One HTTP test was changed from `vi.spyOn` counting to a plain recording wrapper. This is a test-mechanics change that does not weaken any assertion.
- **The AuthApp tests now render a stub workspace.** This is reasonable isolation: one new test covers the real workspace path.
- **Gaps:** R10, plus no assertion that logs exclude content (AC-3; checked by inspection only).
- **Verification claims:** they match the recorded outputs. The format check on this machine was run with `--end-of-line auto`, and CI ran the plain check and passed.

## Security/privacy-relevant review

- **Injection:** none found (registry-only field names with a pattern check; bound values; zod-validated decisions; model output is never executed).
- **Authorization:** routes are guarded by `SessionGuard` and the global Origin guard. The analysis session is derived from `request.auth.sessionId`, and the user ID is checked against the row. Cross-user isolation is tested.
- **Data to the model:** the context builder selects only metadata. The leak test covers names, IDs, and figures.
- **Logging:** only error class names and event types are logged; no message text or values.
- **Caching:** `Cache-Control: no-store` on `/api/analysis` (tested).
- **Abuse limits:** 500-character messages; the 200-message limit (R2 is about its visibility); one turn at a time; the row cap.
- **Dependencies:** `zod` (approved). The audit found 0 production issues.
- **Production guard:** `ANALYSIS_MODEL=demo` is refused in production. `none` is the production default (notes, deviation 2): a safe failure mode.
- **Secrets:** none added. The scan of changed files was clean.

## Recommendation

**Return to implementation for a short pass. No blocking defects.**

- **Fix:** R2, R3, and R4. Each touches a stated criterion (AC-12, AC-2, AC-7), and each fix is small.
- **Also worth fixing in the same pass:** R5, R6, R10, and R11 (small UI and test items).
- **Needs your decision:** R1 and R7 (fix now, or defer to TASK-004 with handover entries). They don't affect TASK-003 with the demo model, but they will once a real model's latency arrives.
- **Optional:** R8, R9, and R12.
- **Still to check in a browser:** the conversation-panel fix and a narrow-screen (320 px) view.

After the fixes, run a second review round, then closeout.
