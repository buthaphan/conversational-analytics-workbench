# Implementation notes: TASK-003 Conversational workflow

**Spec revision:** approved 2026-11-08 ([01-spec.md](01-spec.md))
**Plan:** [02-implementation-plan.md](02-implementation-plan.md)
**Branch:** `feature/TASK-003-conversational-workflow` (from `71f3e96`; implementation committed by the user in `f99200b`)
**Status:** All 16 plan steps are done. The clean install, `npm audit`, the AC-18 walkthrough (user), and CI for `f99200b` all passed. Review round 1 fixes are done (below). Ready for review round 2 after the user commits and CI passes.

## Summary

- **Storage and cleanup:** the conversation, the active result, and its settings are stored in PostgreSQL, per login session. They are deleted with the session.
- **Validation:** a backend capability registry and a strict schema check every model decision before anything happens.
- **Data and analyses:** a deterministic fixture stands in for TheLook. A SQL result engine computes views and the three analyses on the stored rows. Templates write every figure the user sees.
- **Orchestrator:** enforces the AC-6 rules, the switch confirmation, the row cap, and one turn at a time per session.
- **Endpoints:** three API endpoints, plus a development demo model.
- **Web:** a workspace replaces the signed-in placeholder.
- **Handover:** [TASK-004-HANDOVER.md](TASK-004-HANDOVER.md) describes the two adapters TASK-004 replaces and the reference semantics they must match.

## Changed files

| Area | Files |
|---|---|
| Database | `api/prisma/schema.prisma` (4 models, back-relations); `api/prisma/migrations/20261108004310_analysis_storage/`; `migration_lock.toml` (Prisma rewrote it) |
| Session cleanup | `api/src/sessions/session-cleanup.ts` (named steps, `registeredNames()`) |
| Analysis core | `api/src/analysis/` — `capabilities/registry.ts`, `decision/turn-decision.ts`, `data/data-source.ts`, `data/fixture-data-source.ts`, `engine/result-engine.ts`, `answers/answers.ts`, `context/model-context.ts`, `storage/analysis-cleanup.ts` |
| Model adapters | `api/src/analysis/llm/llm-client.ts` (interface, `UnconfiguredLlmClient`), `llm/demo-llm-client.ts`; test double `api/src/test/scripted-llm-client.ts` (excluded from the build) |
| Orchestrator and API | `api/src/analysis/orchestrator/orchestrator.ts`, `analysis.controller.ts`, `analysis.dto.ts`, `analysis.module.ts`; `api/src/app.module.ts`; `api/src/app.ts` (`no-store` also on `/api/analysis`) |
| Config | `api/src/config/config.ts` (`ANALYSIS_MODEL`) |
| API tests | One test file beside each module above, plus `analysis.http.test.ts`, `conversations.http.test.ts`, `dependencies.test.ts`, and additions to `config.test.ts` |
| Web | `web/src/analysis/` (`api.ts`, `format.ts`, `Workspace.tsx`, `ResultView.tsx`, `AnalysisCardView.tsx`); `web/src/auth/AuthApp.tsx` (renders the workspace); `web/src/components/ui/Input.tsx` (accepts `ref`) |
| Web tests | `web/src/analysis/Workspace.test.tsx`; `web/src/auth/AuthApp.test.tsx` (stub workspace, plus one end-to-end case); `web/src/App.test.tsx` (signed-in route) |
| Settings and docs | `example.env`, `compose.yaml` (`ANALYSIS_MODEL`), `README.md`, this folder (`00-context.md` status, `01-spec.md` and `02-implementation-plan.md` approval status, `TASK-004-HANDOVER.md`) |

**Dependency:** `zod` 4.6.7 (approved by the user, 2026-11-08). No other dependency was added.

## Test-first evidence

Each step's test was written and run before the production code.

- **Steps 1–9:** the red runs were observed during implementation, but their exact output was not copied into this record. The notes column records what changed after the first green.
- **Steps 10–15:** the red results are quoted from the runs.

| Step | Test file (tests) | Red | Green and notes |
|---|---|---|---|
| 1 | `storage/analysis-schema.test.ts` (6) | Prisma models undefined before the migration | Green after the migration and `npm run db:generate -w api` (Prisma 7's `migrate dev` does not regenerate the client) |
| 2 | `storage/analysis-cleanup.test.ts` (7) | Cleanup step missing | Green. The first rollback test was **vacuous**: it mocked the shared client, but cleanup steps run on the transaction client. It was rewritten as a separate app with a failing later step, and the analysis data now survives the rollback. Timing check: 20,000 rows deleted in under 2.5 s. |
| 3 | `capabilities/registry.test.ts` (28) | Module missing | Green |
| 4 | `decision/turn-decision.test.ts` (21) | Module missing | Green |
| 5 | `data/fixture-data-source.test.ts` (7) | Module missing | Green |
| 6–7 | `engine/result-engine.test.ts` (19) | Module missing | Green (known answers: ties, even n, empty filtered set, top 10% over the complete set) |
| 8 | `answers/answers.test.ts` (11) | Module missing | Green |
| 9 | `context/model-context.test.ts` (5) | Module missing | Green. **Mutation check:** the builder was made to read assistant text, the leak test failed, and the change was reverted. |
| 10 | `orchestrator/orchestrator.test.ts` (30) | `Cannot find module '../llm/llm-client'` | 30/30 on the first green run. **Mutation check:** with the `FOR UPDATE` lock removed, "processes simultaneous messages one at a time" failed (`PrismaClientKnownRequestError`); restored. |
| 11 | `analysis.http.test.ts` (19) | 19 failed (no routes) | Green after the controller and module. A first wiring error (`Nest can't resolve dependencies of the FixtureDataSource`) was fixed with a factory provider. |
| 12 | `conversations.http.test.ts` (12) | Run after steps 11 and 13 | 12/12 after one fix **in the test**: `vi.spyOn` call counts did not carry across `it` blocks, so 10 tests failed with "called 0 times". The spy was replaced by a plain recording wrapper; no production change. |
| 13 | `llm/demo-llm-client.test.ts` (23), `config/config.test.ts` (+2) | `Cannot find module './demo-llm-client'`; 2 config tests failed | Green |
| 14 | `dependencies.test.ts` (2) | Not red: written after the module, as a guard | Green. It led to one change: the controller read the demo examples by importing the demo adapter, and now reads them through `LlmClient.demoExamples`. |
| 14 | `web/src/analysis/Workspace.test.tsx` (12) | `Failed to resolve import "./Workspace"` | 12/12. AuthApp's existing tests now render a stub workspace; one new test covers the real workspace and the 401 return to sign-in. |

## Verification

Run 2026-11-08 on Windows 11, Node v24.16.0, npm 11.17.0, with PostgreSQL in Docker.

| Check | Command or method | Result | Notes |
|---|---|---|---|
| API tests | `npm test -w api` | Pass: 26 files, 332 tests, **3 consecutive runs** | ERROR log lines come from tests that inject failures on purpose |
| Web tests | `npm test -w web` | Pass: 24 files, 304 tests, plus 1 expected fail | The expected fail is `it.fails` in `src/test/fetch.test.ts` (TASK-001), unchanged |
| Lint | `npm run lint -w api`, `npm run lint -w web` | Pass | |
| Typecheck | `npm run typecheck -w api`, `-w web` | Pass | |
| Format | `npx prettier --check --end-of-line auto .` in `api/` and `web/` | Pass | A plain `format:check` flags many untouched files on this machine, because the Git checkout uses CRLF. CI (Linux, LF) runs the plain check. |
| Build | `npm run build` | Pass | Includes the web build checks (2/2) |
| Forbidden content | Scan of every changed or new file for attribution lines, the employer term, key and token patterns, and the user's email | None found | |
| Clean install | Deleted `api/src/generated`, `api/dist`, `web/dist`; `npm ci`; `npm run db:generate -w api`; then lint, typecheck, `npm test`, `npm run build` | Pass (API 332, web 304 + 1 expected fail, build checks 2/2) | Approved by the user, 2026-11-08. npm 11 again held back the install scripts of `@prisma/engines`, `@swc/core`, and `prisma`; everything works without them, as in TASK-001. |
| `npm audit` | `npm audit`; `npm audit --omit=dev` | 10 moderate (development only); production: **0** | All 10 come from one advisory, `minimatch` 7.0.0–11.0.0 (GHSA-g3hv-75wg-m249, denial of service via pattern amplification), reached only through ESLint and typescript-eslint. These lint tools run on our own source, not on user input. The offered fix downgrades ESLint to 9 (`--force`, breaking), so nothing was changed. TASK-003 added no dependency in this chain. |
| CI | GitHub Actions | Pass for `f99200b` (reported by the user, 2026-11-08) | Includes the plain `format:check` on Linux |
| AC-18 walkthrough | Browser, demo model | Pass (user, 2026-11-08) | The user reported every step as expected. One layout issue was raised and fixed (below). |

### AC-18 manual walkthrough

**Result (user, 2026-11-08):** every step behaved as expected.

**Feedback fixed:** the conversation grew down the page, so the chart and table scrolled out of view and changes to the data could not be seen.
- **Fix:** the conversation history is now a fixed-height panel that scrolls on its own (`max-h-[50vh]`, or the viewport height minus the header on wide screens). It stays scrolled to the newest message. It is keyboard-focusable and labelled "Conversation history". On wide screens the conversation column also stays in place beside the result.
- **Test first:** a new test in `Workspace.test.tsx` was red (`Unable to find role="region" and name "Conversation history"`) and is now green. The web suite has 305 passing tests plus 1 expected fail; lint, typecheck, and format pass.
- **Still open:** the user has not yet seen the fix in the browser.

Start the stack as in the README (Docker, or `npm run db:deploy -w api` then the dev servers). Sign in as `user@example.test`. Use the example buttons, or type the sentences.

| # | Do | Expect | Result |
|---|---|---|---|
| 1 | "Who spent the most last year?", then "The previous calendar year" | A question about calendar year or last 12 months; then a bar chart of the top 10 customers, with its table and the scope summary (2025, row count) | |
| 2 | "Show the lowest spenders" | Lowest first; no reload | |
| 3 | "Only customers who spent over $500" | The summary lists the filter and the match count | |
| 4 | "What share of spending comes from the top 10% of customers?" | A figures card based on **all** customers; the chart is unchanged | |
| 5 | "Show this as a table" | A table with every field | |
| 6 | "Show it as a pie chart" | Refused; bar chart or table offered | |
| 7 | "Who spent the most in 2023?", then **Keep current** | The switch question with Switch and Keep current; the result is unchanged | |
| 8 | "Why did customer spending decline?" | A descriptive reply with an offer; no change | |
| 9 | "Show product sales instead", then **Switch** | Product sales for 2025 replace customer spending | |
| 10 | "Top-selling products", then "By revenue" | A question about revenue or units; then sorted by revenue | |
| 11 | "Only the Jeans category" | Jeans products only | |
| 12 | "What's the weather today?" | An unrelated reply; no change | |
| R | Refresh the page | The same conversation, result, and view | |
| K | Keyboard only: Tab to the input, type, press Enter; Tab to Switch and Keep current | Everything reachable; focus stays in the input after sending | |
| S | Sign out, then sign in | An empty workspace | |

## Review round 1 fixes

Source: [05-task-review.md](05-task-review.md). The user chose to fix R2–R6, R10, and R11, and to defer R1 and R7 to TASK-004 ([DEC-002](DECISION-LOG.md); required work in the handover, section 4). R8, R9, and R12 were left as optional.

| Finding | Test first (red) | Fix |
|---|---|---|
| R2: message limit not visible | Orchestrator: state `notice` (failed: `undefined`). Web: limit shown on screen, input kept; limit shown after a refresh (both failed). | The state has `notice` (backend text, set when the next turn would pass 200 messages). The workspace shows it as a warning above the input. A reply that stored no message does not clear the input. |
| R3: unbounded `top_count` | Registry: `1e20` and `100001` must be rejected (both failed) | `top_count` must be from 1 to the capability's row cap |
| R4: a no-op confirmation cleared a clarification | Orchestrator: Switch, Keep current, and a confirming reply with only a clarification pending (3 failed) | The no-pending branch leaves `pending` unchanged |
| R5: text typed while waiting was erased | Web: type more while the reply is pending (failed) | The input is cleared only if its current value is still the sent text |
| R6: repeated replies not announced | Web: two identical replies must replace the live region's node (failed) | The announcement is a keyed node, a new one per reply |
| R10a: over-cap switch | Orchestrator test: the old result stays (passed on first run: coverage for correct behavior) | No change needed |
| R10b: switch confirmed while a message arrives | Orchestrator test with both in parallel: one result set, contiguous messages, a consistent outcome in either order (passed on first run) | No change needed |
| R10c: axe on more states | axe added to the analysis-card, send-error, and load-error states (passed) | No change needed |
| R11: example buttons inside a status region | Web: the banner's status region contains no buttons (failed) | The examples moved below the banner, outside the `Alert` |

**Checks after the fixes:**
- **API:** 26 files, 339 tests pass.
- **Web:** 24 files, 309 tests pass, plus 1 expected fail.
- Lint, typecheck, and build pass. The format check passes (run with `--end-of-line auto` on this machine).

## Acceptance criteria mapping

| AC | Evidence |
|---|---|
| AC-1 | `analysis-schema.test.ts`, `analysis-cleanup.test.ts` (each end reason, user deletion, rollback, timing) |
| AC-2 | `registry.test.ts` |
| AC-3 | `turn-decision.test.ts`; orchestrator "fails safely" tests (invalid JSON, schema violation, model throws). The log contains the error type only. |
| AC-4 | Orchestrator "retrieves on the first request"; HTTP "answers a message" (DataSource called once) |
| AC-5 | `model-context.test.ts` (leak test, plus the mutation check) |
| AC-6 | Orchestrator tests: (a) the `on the active result` block; (b) and (d) the `clarification` block; (c) the `switching` block; (e) the `replies and failures` block; (f) "treats a request for the same capability and scope as a refinement". The DataSource call count is asserted in each. |
| AC-7 | Orchestrator `switching` block (Switch button, confirm by reply, Keep, decline, implicit clear, nothing pending, retrieval failure); conversations 7 and 9 |
| AC-8 | `result-engine.test.ts`; orchestrator refine and clear-filters tests |
| AC-9 | `result-engine.test.ts`; orchestrator and conversation 4 (complete set while 10 rows are displayed; the view is unchanged) |
| AC-10 | `answers.test.ts`; orchestrator and conversation tests assert the template text. See limitation 3. |
| AC-11 | Orchestrator "refuses a result over the row cap" (nothing stored) |
| AC-12 | `analysis.http.test.ts` (401, 403, 400 bodies, `no-store`, isolation, concurrency, 200-message limit) |
| AC-13 | HTTP refresh and sign-out tests; `Workspace.test.tsx` restore test; AuthApp test for the 401 return |
| AC-14 | `dependencies.test.ts`; `fixture-data-source.test.ts`; scripted double used in the orchestrator tests |
| AC-15 | `demo-llm-client.test.ts`; `config.test.ts` (default, `none`, production refusal); `Workspace.test.tsx` (banner, examples) |
| AC-16 | `Workspace.test.tsx` (scrolling conversation panel, empty state, banner, scope summary, bar chart and table, table view, analysis card, switch group, busy state, live region, focus, errors), with axe run on three states (empty with demo banner, loaded result, pending switch). **320 px reflow:** the layout stacks in one column below the `lg` breakpoint and the tables scroll inside their own region. To be confirmed in the walkthrough. |
| AC-17 | `conversations.http.test.ts` (12 conversations through HTTP) |
| AC-18 | Walkthrough above: passed by the user; the layout fix still needs a visual check |
| AC-19 | README, `example.env`, `compose.yaml`, TASK-004 handover; CI passed for `f99200b` |

## Simplicity check

No dedicated review is needed. Points a reviewer may want to weigh:

- **One transaction per turn:** `orchestrator.ts` keeps each turn in one transaction (TD-6, TD-7), so the engine and the context builder take an optional transaction client. That threads a `db` argument through a few functions, but avoids a separate locking mechanism.
- **Card metadata:** state and cards carry field labels, kinds, and the row noun, so the web app does not duplicate the registry.

## Deviations, blockers, and limitations

1. **AC-17 uses the demo model as the scripted model.** The conversation tests drive the HTTP API through `DemoLlmClient`'s fixed sentence-to-decision script. That is the same script as the AC-18 walkthrough, so the tests and the walkthrough cover identical paths. The orchestrator unit tests use the queue-based `ScriptedLlmClient`.
2. **`ANALYSIS_MODEL=none` (not named in the spec).** Production cannot use `demo`, and TASK-003 has no real model, so `none` is the production default: the API starts, and questions get the generic error. TASK-004 adds `claude`.
3. **Table and chart values are formatted in the browser.** Answer text and analysis figures come from backend templates (AC-10). The displayed rows' cells and the analysis card's figures arrive as backend-computed numbers, and `web/src/analysis/format.ts` formats them with the same rules (currency 2 dp, separators, 1-dp percentages, dates). No number is computed in the browser.
4. **The fixture has no 2023 data** (it covers 2024-01-01 to 2026-11-07). Conversation 7 proposes 2023 and is then kept. Accepting it would load an empty result.
5. **Model call inside the turn transaction:** see the handover. This is fine for the demo, but TASK-004 must review the timeout and pool size.
6. **Example buttons send immediately** rather than filling the input. This keeps the walkthrough to one click per step.
7. **Design-system change:** `Input` now accepts a `ref` (React 19 prop), so focus can return to it after sending.

## Handoff

1. Done: clean install and `npm audit` (see Verification).
2. Done: AC-18 walkthrough. The user still needs to check the conversation-panel fix in the browser.
3. Done: committed in `f99200b`, pushed; CI passed.
4. Then `/task-review`.
