# Implementation notes: TASK-004 Real data and AI adapters

**Spec:** [01-spec.md](01-spec.md) revision 1 (approved 2026-11-08). **Plan:** [02-implementation-plan.md](02-implementation-plan.md). **Start:** `bf2675e`.

## Step 1: lock inventory (`analysis_sessions` row)

Every path that reads, locks, or deletes the row, after the two-phase change:

| Path                                     | What it takes                                                                                                                                                                   | Held for                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Turn phase A (`turn`)                    | `ensureSession` insert (FK check: `FOR KEY SHARE` on the `auth_sessions` row); `FOR UPDATE OF` the analysis-session row; reads for the model context                            | A few queries; no model call or retrieval                    |
| Turn phase B                             | Nothing: model call and retrieval run outside any transaction                                                                                                                   | —                                                            |
| Turn phase C (`save`)                    | `FOR UPDATE OF` the row (only if the login session has not ended); message, result-set, and row inserts; old result-set delete; marker cleared                                  | The writes; long only when storing a large result (see AC-8) |
| `release` (failure path)                 | One `updateMany` on the row, matched on this turn's marker                                                                                                                      | One statement                                                |
| `getState`                               | `ensureSession` insert (waits only on a concurrent phase A's uncommitted insert), reads                                                                                         | Reads                                                        |
| Session end (`SessionStore.finishEnded`) | `FOR UPDATE` on `auth_sessions`, then the cleanup step deletes the analysis session (needs its row lock; cascades to messages, result sets, rows), then deletes `auth_sessions` | Its 5 s transaction; now waits only on phase A or C          |
| `SessionStore.end` (mark ended)          | `UPDATE auth_sessions.ended_at` (`FOR NO KEY UPDATE`, compatible with the FK's `KEY SHARE`)                                                                                     | One statement                                                |
| Sweeper                                  | Through `end` and `finishEnded`                                                                                                                                                 | As above                                                     |
| User deletion                            | Cascade from `users`                                                                                                                                                            | —                                                            |

Residual: a phase C that stores a very large result holds the row while it inserts; a session end at that moment waits for it. Bounded by the row cap and measured in step 8 (AC-8).

## Step 2: two-phase turn (AC-1)

**Design** (DEC-001): `turn()` in `orchestrator.ts`:

- **Phase A** claims the turn: message limit, live-marker check (`TurnInProgressError`, HTTP 409 `turn_in_progress`), marker written (`turn_id`, `turn_started_at`), model context built with the not-yet-stored user text.
- **Phase B** runs the model and the retrieval with no transaction.
- **Phase C** (`save`) locks the row only if the login session has not ended and the marker is still this turn's, then writes both messages and the outcome and clears the marker. Otherwise it throws `SessionEndedError` (401) or `TurnInProgressError` (409, taken over) and writes nothing. Phase C never creates an analysis session: creation (`ensureSession`) runs only in phase A and `getState`, and only for a login session that has not ended.
- **Planning shared by B and C:** `planRequest` (pure) decides what a data request means; `retrievalFor` uses it to decide whether phase B fetches, and `apply` uses it in phase C, so both phases always agree. `load` refuses to run without phase B's retrieval.
- **Failure paths:** model errors, invalid decisions, retrieval errors, and the row cap are ordinary outcomes saved in phase C (marker cleared there). Any other exception clears this turn's marker in `release` and is rethrown.
- **Deadline:** `TURN_DEADLINE_MS = 120 000` (model 30 s with 1 retry, plus the query's 30 s). Phase C runs with a 60 s transaction timeout for large results.

**Test-first evidence**

- Red: `api/src/analysis/turn-lock.http.test.ts` (13 tests) before the change. First test: `× signs out promptly while the model is working … Error: Test timed out in 5000ms`: sign-out blocked on the turn's lock (R1 reproduced). The remaining tests failed or timed out in cascade (the held turns kept their locks).
- Green: all 13 pass after the change.
- Covered: sign-out while the model works and while the data source works; sign-in elsewhere; sweeper idle expiry; refresh during a first turn (< 1 s, `turnInProgress: true`); second message and Switch → 409 with nothing changed; stale-marker takeover with the old outcome discarded (409); simultaneous messages stay consistent; the marker is freed after a model failure, an invalid decision, a retrieval failure, an over-cap result, and an unexpected error while saving (500).
- Model context: `build(…, latestUserText)` appends the unsaved message within the 20-message window. Its test (`model-context.test.ts`) was written after the change, so it has no red phase; it guards the window size.

**TASK-003 tests changed (DEC-001)**

- `analysis.http.test.ts`: the state now includes `turnInProgress: false`. "serializes concurrent messages" was removed and replaced by the consistency test in `turn-lock.http.test.ts`.
- `orchestrator.test.ts`: TD-7 now expects one turn at a time with the others refused (`TurnInProgressError`); the R10b switch-plus-message test also accepts the outcome where one of the two is refused.

**Result:** `npx vitest run` (API): 27 files, 351 tests passed.

**Files:** `api/prisma/schema.prisma`, `api/prisma/migrations/20261108190000_turn_marker/`, `api/src/analysis/orchestrator/orchestrator.ts`, `api/src/analysis/analysis.controller.ts`, `api/src/analysis/answers/answers.ts`, `api/src/analysis/context/model-context.ts`, `api/src/test/gate.ts`, tests above.

## Step 3: turn in progress in the web app (AC-2)

- `web/src/analysis/api.ts`: `turnInProgress` in the state; HTTP 409 maps to the `turn-in-progress` error.
- `web/src/analysis/Workspace.tsx`:
  - While `turnInProgress` is true, it shows "Still answering your last message…" (info `Alert`, `role="status"`) and sets Send and Switch/Keep to the loading state (`aria-disabled`, activation ignored). The input stays editable, so typed text is never lost; Enter or a click announces "Please wait for the current reply."
  - It re-reads the state every `pollIntervalMs` (2 s), at most one request at a time. When the turn is answered it shows the new state and announces the last assistant message.
  - Polling stops on 401 (back to sign-in) and after `turnDeadlineMs` (120 s, the API's deadline), which shows "This is taking longer than expected. Try again in a moment." with a Try again button.
  - A 409 reply to a message or Switch keeps the typed text and starts the same wait.
- **Red:** 4 new tests in `Workspace.test.tsx` failed before the change (no notice, no polling). **Green:** 23 of 23 in the file pass. Axe runs on the in-progress and stalled states.
- **Result:** web suite 24 files, 315 passed plus 1 deliberately failing self-test; typecheck and lint pass for both packages.
- **Interpretation (AC-2):** the spec says the composer is "disabled". The Send control is disabled; the text field stays editable on purpose, consistent with the TASK-003 rule that typed text is kept while waiting (review R5).

## Step 4: configuration and wiring (AC-3, AC-4)

- `api/src/config/config.ts`:
  - `ANALYSIS_MODEL` accepts `demo | none | claude`; `claude` requires `ANTHROPIC_API_KEY` and takes an optional `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`, ID format checked).
  - New `DATA_SOURCE` (`fixture | bigquery`, default `fixture` outside production and `bigquery` in production); `bigquery` requires a valid `GOOGLE_CLOUD_PROJECT`.
  - Production refuses `demo` and `fixture`.
  - The key is kept only when the model is `claude`; no error message contains a value of the key.
- **Red:** 10 new tests in `config.test.ts` failed before the change. **Green:** 31 of 31. "never puts a secret value in an error message" passed before the change too (no message echoed the key); it guards the new messages.
- `example.env`: placeholders and setup notes for every new variable; no real value.
- `dependencies.test.ts`: the adapter rule now covers `bigquery-data-source` and `claude-llm-client`, and a new rule allows each SDK only in its adapter file. Both pass vacuously until steps 7 and 9 add the adapters; they are mutation-checked there.
- **Module wiring** per configuration is added with each adapter (steps 7 and 9), since the adapters do not exist yet.

## Step 5: SDKs and live-run setup (AC-11)

- Installed with the user's approval (DEC-003): `@anthropic-ai/sdk` ^1.6.0, `@google-cloud/bigquery` ^9.6.0. `npm audit --omit=dev`: 0 vulnerabilities. Full audit: the same 10 moderate development-only `minimatch` findings via ESLint as before.
- Live suites are `src/live/**/*.live.ts`, run only by `api/vitest.live.config.mts` through `npm run live:profile | live:test | live:eval -w api`. The scripts let Node load `../.env` (`--env-file-if-exists`); Claude never opens it. They are excluded from `npm test` (`*.test.ts` only) and from the build (`tsconfig.build.json`), and each suite skips with a message when its credentials are missing.

## Step 6: TheLook profile (AC-5)

- Live run approved by the user (2026-11-08): 14 read-only queries (`src/live/profile.live.ts`), each capped at 1 GB billed; at most 10.2 MB processed per query. The first run printed nothing (Vitest hides console output); it was rerun with `--silent=false`, and once more for two added date-gap queries. All free (Sandbox).
- Results and decisions: [docs/product/THELOOK-PROFILE.md](../../../product/THELOOK-PROFILE.md).
- **Date window changed from the spec's recommendation** (the spec leaves this to the profile): `orders.created_at` instead of `order_items.created_at`. Item timestamps run from 3 h before to 96 h after their order, and 26% of orders have items on more than one date, so item dates would split an order across periods. The order date keeps every item of an order in one window, as in the reference fixture.
- Confirmed reference rules: `Complete` is a real status (Shipped, Processing, Cancelled, Returned are the others; an order never mixes statuses); `sale_price` has float noise, so per-item cent rounding is needed; 2 products have no name (shown as `Product <id>`).

## Step 7: BigQuery adapter (AC-6, AC-4)

- `api/src/analysis/data/bigquery-data-source.ts`: `BigQueryDataSource` over an injected `QueryRunner`. `createBigQueryRunner` (the only SDK import) uses application default credentials, location `US`, standard SQL, `maximumBytesBilled` 1 GiB, `jobTimeoutMs` 30 s.
  - Two fixed queries. Scope and row limit are typed parameters (`DATE`, `DATE`, `INT64`). `LIMIT rowCap + 1` is the over-cap guard; there is no other sort or limit.
  - Money is summed in SQL as integer cents per item and converted with the shared `money.ts` (also used by `FixtureDataSource` now), so `avg_order_value` uses exactly the reference rounding.
  - Rows are type-checked (IDs and names non-empty strings; counts safe integers ≥ 1). Any failure throws `BigQueryRetrievalError`, whose message never contains the cause, project, or scope.
- **Red:** 12 of 19 data-source tests failed (`BigQueryDataSource is not a constructor`). **Green:** 19 of 19.
- Wiring: `analysis.module.ts` picks `BigQueryDataSource` for `DATA_SOURCE=bigquery`. `analysis.module.test.ts`: the BigQuery case failed first, then passed.
- **Mutation check (AC-4):** a temporary `src/analysis/zz-mutation.ts` importing the SDK and the adapter made both dependency rules fail, naming the file; the file was then deleted.

## Step 8: row caps (AC-8, N2) and known-answer check (AC-7)

- Registry caps are 50,000 for both capabilities (profile: at most about 25,700 customers and 22,100 products for 5 years; 29,120 products in all); `DEFAULT_ROW_CAP` was removed. The orchestrator now takes `min(option, registry)`, so the option can only lower a cap.
- **Red:** 3 tests failed: the caps were 100,000; `top_count` 50,001 was accepted; an option of 10× the cap stored 100,001 rows. **Green** after the change.
- **Timed** (local Docker PostgreSQL): storing 50,000 rows in phase C took 5.5 s (limit 30 s); session-end cleanup of 50,000 rows took 31 ms (limit 5 s). Earlier, before the change, 100,000 rows took 8.9 s and 68 ms.
- `dev-account.guard.test.ts`: its production environment now includes a placeholder `GOOGLE_CLOUD_PROJECT`, because production defaults to BigQuery (AC-3). The assertions are unchanged.
- **Known-answer check** (`src/live/known-answer.live.ts`, AC-7): live run approved by the user (2026-11-08).
  - **First run: 0 rows everywhere, a real bug.** A plain string parameter declared as `DATE` reaches BigQuery as NULL. A temporary diagnostic file (`src/live/zz-diag.live.ts`, deleted afterwards) confirmed it: `SELECT @s` with type `DATE` returned null, and without a type it returned the value. The unit tests could not see this, because they replace the runner.
  - **Fix, test-first:** `sdkParams` converts `DATE` parameters to `BigQuery.date(...)`. 2 new unit tests failed (`sdkParams is not a function`), then passed.
  - **Second run: 10 of 10 pass.**
    - Recent week (2026-10-01 to 2026-10-08): 1,914 items with all five statuses; 315 customers and 475 products.
    - Month boundary (2025-06-28 to 2025-07-04): 673 items, all five statuses; 109 customers and 179 products.
    - Every row equals the reference aggregation over the raw extract, for both capabilities.
  - **Hand checks** (6 customers, 6 products; the item prices are FLOAT32 values such as 29.989999771118164):
    - Customer 10088: 25.00 + 29.99 + 56.00 + 57.99 = 168.98 in 1 order, so the average is 168.98. ✓
    - Customer 12114: 11.99. ✓ Customer 12981: 24.50 + 26.99 = 51.49. ✓
    - Customer 10009: 8.99 + 59.50 = 68.49. ✓ Customer 10378: 32.98. ✓ Customer 10477: 24 + 25 = 49. ✓
    - Products 10089, 10215, 10280, 10167, 10173, 10402: one item each, rounded to the cent (for example 44.470001… becomes 44.47). ✓ Most TheLook products sell about once, so the samples have single items; the automated check covered all 654 product rows.
  - **Realistic scopes:** last 1 year has 11,762 customers and 13,621 products; last 5 years has 25,790 and 22,231. About 10 MB per query, 2.2–5.1 s. All under the 50,000 cap; recorded in the profile.

## Step 9: Claude adapter (AC-9, AC-4)

- `api/src/analysis/llm/claude-llm-client.ts`: `ClaudeLlmClient` over an injected `CreateMessage` (`createAnthropicMessages` holds the only SDK import).
  - The request has a fixed system prompt (`SYSTEM_INSTRUCTIONS` plus the catalogue JSON) with `cache_control`, and one user turn (the rest of `ModelContext` as JSON plus the message, in tags). Nothing else is sent.
  - Settings: `max_tokens` 8000, effort `medium`, adaptive thinking (default), `timeout` 30 s, `maxRetries` 1.
  - Structured output uses `structuredOutputSchema(TURN_DECISION_JSON_SCHEMA)`: `oneOf` becomes `anyOf`, length and numeric limits are dropped, and every object is closed. The orchestrator still validates the full schema.
  - It throws `ModelRefusalError`, `ModelTruncatedError`, or `ModelOutputError`; SDK errors propagate. The raw text is returned without validation or repair.
  - **Server-side refusal fallback** (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`), enabled by default per the Claude API reference: a refused request is re-run once on a suitable model, at that model's price. It can be dropped if the user prefers.
- **Red:** the module did not exist. **Green:** 12 of 12. The request test checks the exact system and user content (nothing beyond the context and the text); the data-row leak test for the context itself remains `model-context.test.ts`.
- Wiring for `ANALYSIS_MODEL=claude`: its test failed first, then passed.
- `model-context.ts`: `catalogue()` was renamed to the exported `buildCatalogue()` for the evaluation (no behavior change).

## Step 10: evaluation (AC-10)

- `src/live/eval/cases.ts` has 37 cases, each with a starting state and one or more acceptable decisions:
  - 20 from the demo model's reference pairs;
  - 6 from the catalogue's AI-selection examples;
  - 4 from requirements examples A–D, where region and retention are not in this data, so they are safety cases;
  - 7 added cases (prompt injection, a poem, a causal "why", displayed-rows analysis, a month scope, a row count, ranking by orders).

  9 are safety cases. Matching: action type, relevance, capability, and, where specified, scope (exact, or "inherit"), refinement (subset), and analysis (subset).

- `src/live/eval.live.ts` runs every case through `ClaudeLlmClient` and `parseTurnDecision`. It reports per-case results, the pass rate, the safety result, latency, tokens, and estimated cost; `EVAL_SAVE_BASELINE=1` saves `src/live/eval/baseline.<model>.json`. It asserts at least 90% overall and 100% of safety cases.
- Offline harness check `src/live/eval/cases.test.ts` (part of `npm test`): the demo model's reference decisions pass all 20 demo cases, and a wrong decision is rejected (22 tests).

**Result:** API 30 files, 397 tests passed before the evaluation files; lint and typecheck clean.

### Evaluation runs (approved: up to 5)

1. **Full run 1: all 37 rejected with HTTP 400** before reaching the model (unbilled). The API's message: "Schemas contains too many optional parameters (26) … (limit: 24)". zod inlined the shared `refinement` and `filter` schemas twice.
   - **Fix, test-first:** a new adapter test counts optional properties in the structured-output schema. It failed with 26, then passed after `TURN_DECISION_JSON_SCHEMA` was generated with `reused: "ref"` (shared `$defs`): 18.
   - The eval now also prints the API's error message (local console only) and accepts `EVAL_CASES` to rerun selected cases.
2. **Probes:** demo-01 printed the 400 message; demo-04 confirmed the API accepts the new schema (pass, $0.012).
3. **Full run 2:** 37 of 37 pass and 9 of 9 safety cases; median 1.8 s, max 2.6 s; $0.088.
4. **Full run 3 (baseline saved):** 37 of 37 and 9 of 9; median 1.7 s, max 2.5 s; $0.0877 ($0.0024 per turn). Tokens: 14,488 uncached input, 159,470 cache-read input, 2,679 output. No case was served by a fallback model. Saved as `api/src/live/eval/baseline.claude-sonnet-5-5.json` (checked: no key material).

The system prompt needed no change. Model spend for the task so far: about $0.20.

**Disclosure:** during step 10, I ran `npx tsx` three times to inspect the decision schema and the eval cases. `tsx` is not a project dependency, so npx fetched it into the npx cache from the network without asking first. It is not added to the project. Later diagnostics used the project's own Vitest instead.

## Step 11: docs and verification (AC-11, AC-13)

- **README:** stage, configuration matrix, BigQuery and Claude setup (spend limit, credentials outside the repository), measured cost and latency, live checks and their cost. `example.env` was updated in step 4.
- **Formatting:** Prettier `--write` on every file this task changed. `--check` on them is clean (the repo-wide check remains noisy on this Windows checkout, as noted in TASK-003).
- **Final checks** (2026-11-08):
  - `npm run lint`: exit 0. `npm run typecheck`: exit 0. `npm run build`: exit 0.
  - `npm test`: API 31 files, 422 tests passed. Web 24 files, 315 passed plus 1 deliberately failing self-test.
  - `npm audit --omit=dev`: 0 vulnerabilities. Full audit: the same development-only `minimatch` advisory via ESLint.
  - The web build (`web/dist`) contains none of `ANTHROPIC`, `sk-ant`, `GOOGLE_CLOUD_PROJECT`, or `application_default`. The API build (`api/dist`) contains no `live` files.
  - Live: profile 14 of 14, known-answer 10 of 10, evaluation 37 of 37 (above).
- **CI:** not yet run for this branch (the user pushes). CI needs no secrets: live suites are outside `npm test`, and `cases.test.ts` is offline.

## Criterion mapping

| AC    | Evidence                                                                  | State                                         |
| ----- | ------------------------------------------------------------------------- | --------------------------------------------- |
| AC-1  | `turn-lock.http.test.ts` (13), updated TASK-003 concurrency tests         | Met (automated)                               |
| AC-2  | `Workspace.test.tsx` (4 new, axe)                                         | Met (automated); browser check in AC-12       |
| AC-3  | `config.test.ts` (10 new)                                                 | Met                                           |
| AC-4  | `analysis.module.test.ts`, `dependencies.test.ts` (mutation-checked)      | Met                                           |
| AC-5  | `THELOOK-PROFILE.md`, `profile.live.ts`                                   | Met                                           |
| AC-6  | `bigquery-data-source.test.ts` (14)                                       | Met                                           |
| AC-7  | known-answer live run 10 of 10, hand checks                               | Met                                           |
| AC-8  | registry, orchestrator, and cleanup tests; timings                        | Met                                           |
| AC-9  | `claude-llm-client.test.ts` (13)                                          | Met                                           |
| AC-10 | runs 2 and 3: 37 of 37, safety 9 of 9; baseline saved                     | Met                                           |
| AC-11 | live suites excluded; bundle and dist checks; no secrets in logs or files | Met locally; **CI pending**                   |
| AC-12 | user walkthrough confirmed 2026-11-08 (step 12)                           | Met                                           |
| AC-13 | README, `example.env`                                                     | Met; closeout carries over the handover items |

## Simplicity check

- `orchestrator.ts` grew from 605 to 813 lines (phases A/B/C, `planRequest`, `retrievalFor`). The planning logic was extracted into pure functions shared by phases B and C rather than duplicated, and `requestData` now only renders a plan.
- The adapters are thin and isolated behind the TASK-003 interfaces; the SDK glue (`createBigQueryRunner`, `createAnthropicMessages`) is a few lines each.
- No concern warrants `/code-simplicity`. A reviewer may want to look at the length of `orchestrator.ts` (813 lines).

## Known limitations

- **Phase C and session end:** storing a result at the 50,000-row cap holds the row lock for about 5.5 s. A sign-out at that exact moment waits longer than cleanup's 5 s transaction allows, so it fails and the sweeper retries; the data is never left accessible. Rare in practice: the profile's largest scope was 25,790 rows (about 3 s to store).
- **TheLook changes daily** (new and future-dated rows), so a scope can return slightly different numbers on different days.
- **Evaluation coverage:** 37 single-turn cases with hand-built contexts; multi-turn behavior is covered by the walkthrough (AC-12), not by the evaluation.
- **Real adapters in Docker Compose:** out of scope (npm dev servers only).

## Step 12: manual walkthrough (AC-12)

- **User confirmation (2026-11-08):** "I have check the app and everything is working as expected", with `ANALYSIS_MODEL=claude` and `DATA_SOURCE=bigquery` on the npm dev servers.
- **Setup issue found:** the user's `.env` had no `ANALYSIS_MODEL` or `DATA_SOURCE` lines, so the API ran with the development defaults (demo and fixture). Adding the two lines and restarting fixed it. The README's configuration section covers this.
- **Measured** (from the live checks rather than the browser): model decision median 1.7 s (max 2.5 s), about $0.0024 per turn; BigQuery retrieval 2.2–5.1 s for 1-to-5-year scopes, about 10 MB processed.
- **Layout feedback** from the walkthrough was implemented as [DEC-004](DECISION-LOG.md): a larger logo used alone as the page heading, a navy header with a light logo variant, a compact scope summary, a chart that fills the spare height, dense result tables that scroll inside their own frame with sticky column headers, and a conversation column matching the result column's height. The type-scale change was tried and reverted (the user had been at browser zoom). Web tests were added test-first for each change (Card, Table, ChartWithTable, chart theme, tokens, AuthApp, Workspace). The user confirmed the final look; further visual work is planned for a later branch.

### Open item for task review

- **One unexplained failed turn.** The first data-loading message of the walkthrough ("last 12 months", about 07:10 UTC) showed "Could not send your message", and its turn marker stayed set with nothing saved. The development database showed marker set, 2 messages, no result set. The marker expired after the 2-minute deadline as designed, and the same request then worked.
  - Any error the API handles clears the marker (`release`), so the most likely cause is that the API process stopped or restarted mid-turn (the dev server's `node --watch`), or that the request never completed. The API logs were not available.
  - Not reproduced since, and the live suites and every later turn passed. If it recurs, capture the API terminal output.
  - The stale-marker path recovered as designed (AC-1).

## Final verification (after DEC-004)

- `npm run lint`: exit 0. `npm run typecheck`: exit 0. `npm run build`: exit 0.
- `npm test`: API 31 files, 422 passed. Web 24 files, 329 passed plus 1 deliberately failing self-test.
- Prettier `--check` on changed source files: clean. The two SVG logo files have no Prettier parser and are not checked by the repo's `format:check`.
- The web build contains none of the key or credential names.
- CI: not yet run for this branch.

## Files changed in this task (summary)

- **API:** orchestrator (two-phase turn), controller, answers, model context, registry caps, config, analysis module, BigQuery and Claude adapters, `money.ts`, migration `20261108190000_turn_marker`, tests, live suites (`src/live/`), `vitest.live.config.mts`, package scripts and dependencies.
- **Web:**
  - `Workspace` (in-progress handling, layout);
  - `api.ts`, `ResultView`, `Layout`, `AuthApp`;
  - `Card` (`compact`, `stretch`), `Table` (`maxHeight`, `dense`, `hideCaption`), `ChartWithTable` (`compact`, `tableClassName`);
  - chart theme font size, token pairings, `logo-on-dark.svg`, tests.
- **Docs:** README, `example.env`, `docs/product/THELOOK-PROFILE.md`, `docs/design/DESIGN-SYSTEM.md` (logo and header), the task folder, and `assets/brand/logo-on-dark.svg`.
