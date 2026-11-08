# Specification: TASK-004 Real data and AI adapters

**Status:** Approved 2026-11-08  
**Revision:** 1  
**Owner:** buthaphan  
**Related idea:** [IDEA.md](../../../ideas/2026-11-08-conversational-analytics/IDEA.md), [ARCHITECTURE-PROPOSAL.md](../../../ideas/2026-11-08-conversational-analytics/ARCHITECTURE-PROPOSAL.md); contract: [TASK-004-HANDOVER.md](../../completed/TASK-003-conversational-workflow/TASK-004-HANDOVER.md)  
**Decision log:** [DECISION-LOG.md](DECISION-LOG.md)

## Problem and goal

TASK-003 proved the conversational workflow with a fixture and a demo model that only understands fixed sentences. A showcase user cannot yet ask a real question about TheLook data.

**Goal:** a signed-in user asks free-text questions and gets answers computed from TheLook in BigQuery, with Claude Sonnet 5.5 choosing the capability and parameters. The TASK-003 rules (backend enforcement, switch confirmation, backend-written numbers, session-scoped storage) are unchanged. A slow model or query never blocks sign-out, sign-in, or a refresh.

**Measurable outcome:** the known-answer check matches the reference rules exactly; the model evaluation meets its threshold (AC-10); the user completes a real browser conversation (AC-12).

## Scope

### In scope

- **Two-phase turn** (DEC-001): no database lock is held during the model call or the retrieval. Fixes TASK-003 R1 and R7.
- **Web handling of a turn in progress:** after a refresh, or when a message is refused because a turn is running.
- **Configuration:** `ANALYSIS_MODEL=claude`, a new `DATA_SOURCE` setting, credentials from the environment only.
- **TheLook profiling**, recorded in a profile document.
- **BigQuery `DataSource`** for `customer_spending` and `product_sales_performance`, matching the reference rules.
- **Known-answer check** against the reference aggregation.
- **Real row caps** in the registry (N2).
- **Claude `LlmClient`** using structured output with `TURN_DECISION_JSON_SCHEMA`.
- **Model evaluation:** an opt-in script and evaluation set; its result is the baseline for later model comparison.
- **Docs:** README setup for Google Cloud and Anthropic, `example.env` placeholders, measured latency and cost.

### Out of scope

- The other 8 capabilities, other chart types, an "explain results" feature (all deferred in the idea record).
- Amazon Bedrock, AWS deployment, service accounts for a hosted showcase, showcase account provisioning.
- Real adapters inside Docker Compose. Docker keeps the fixture and demo model; the real adapters run with the npm dev servers. (Mounting credentials into a container is left to the AWS work.)
- Comparing models (only the baseline for Sonnet 5.5 is recorded).
- Query result caching beyond BigQuery's own.
- TASK-003's optional items R8, R9, R12.

## Assumptions and dependencies

| Item | Owner | Validation |
|---|---|---|
| A Google Cloud project with the BigQuery API enabled (Sandbox), and `gcloud auth application-default login` done locally | User | The first approved profiling run succeeds |
| An Anthropic Console account, an API key for this app in `.env`, and a monthly spend limit | User | The first approved Claude call succeeds; spend limit confirmed by the user |
| **Billing:** whether Claude Max credits apply to API usage (normally they don't) | User | **Pending.** Blocks the first live Claude call only (plan step 9) |
| BigQuery Sandbox limits (1 TB queried and 10 GB stored per month; we store nothing in BigQuery) | Claude | Recorded in the profile from the official docs and observed bytes per query |
| `@anthropic-ai/sdk` and `@google-cloud/bigquery` (DEC-003) | User approves install | Install prompt; dependency audit recorded |
| Claude runs live calls only after the user approves each run (DEC-002) | Claude | Recorded in the implementation notes |
| The public dataset `bigquery-public-data.thelook_ecommerce` stays available with its documented schema | — | Profiling |

## Acceptance criteria

| ID | Criterion | Verification evidence | Status |
|---|---|---|---|
| AC-1 | **Two-phase turn.** A message or Switch turn runs as: (A) a short locked transaction that checks the message limit, claims the turn by writing a turn marker (ID and start time) on the analysis session, and snapshots the facts and model context; (B) the model call, decision validation, and any retrieval, with **no transaction or lock held**; (C) a short locked transaction that writes both messages, the outcome, and any new result set, and clears the marker, **only if the analysis session still exists and still carries this turn's marker**. Otherwise the outcome is discarded and nothing is written; phase C never creates an analysis session. While a marker is set and younger than the turn deadline, another message or Switch is refused with HTTP 409 `{ code: "turn_in_progress" }` and changes nothing. A marker older than the deadline (a crashed turn) may be taken over. Every failure path (model error, invalid decision, retrieval error, row cap, unexpected exception) clears the marker. The turn deadline exceeds the model and query timeouts combined. | Integration tests with a gated slow fake model and a slow fake data source: (1) sign-out during phase B completes within cleanup's normal 5 s transaction, the analysis data is gone, and the late outcome writes nothing; (2) sign-in elsewhere during phase B succeeds; (3) `GET /state` during a first turn returns in under 1 s; (4) second message and Switch during a turn → 409, state unchanged; (5) stale marker taken over; (6) each failure path clears the marker. All TASK-003 tests pass; the concurrent-POST test is updated to the 409 rule (DEC-001). | Not started |
| AC-2 | **Turn in progress in the web app.** `GET /state` includes `turnInProgress: boolean`. When it is true (for example after a refresh during a turn), the workspace shows "Still answering your last message…" in a polite live region, disables the composer and Switch buttons, and re-reads the state every 2 s until it is false, then shows the new messages. A 409 `turn_in_progress` reply shows the same notice and does not lose the user's typed text. Polling stops on 401 (back to sign-in) and after the turn deadline (shows a retry message). | Web component tests (refresh mid-turn, 409, completion, 401, deadline), axe on the in-progress state; API test for the field | Not started |
| AC-3 | **Configuration.** `ANALYSIS_MODEL` accepts `demo`, `none`, `claude`; `DATA_SOURCE` accepts `fixture`, `bigquery`. Defaults: development and test `demo` + `fixture` (no credentials needed); production `none` + `bigquery`. Production refuses `demo` and `fixture`. `claude` requires `ANTHROPIC_API_KEY`; `bigquery` requires `GOOGLE_CLOUD_PROJECT`. `ANTHROPIC_MODEL` optionally overrides the model ID (default `claude-sonnet-5-5`). Invalid or missing values stop the API at startup with a message that names the variable and never contains a secret value. `example.env` documents every variable with placeholders only. | `config.test.ts` cases for each value, default, production rule, missing credential, and a test that a fake key string never appears in any error message | Not started |
| AC-4 | **Adapter wiring.** `analysis.module.ts` chooses the `DataSource` and `LlmClient` from the config. It remains the only production file importing a concrete adapter, and only the adapter files import the SDKs. | `dependencies.test.ts` extended to the new adapters and both SDK packages; module wiring test per config combination | Not started |
| AC-5 | **TheLook profile** recorded in `docs/product/THELOOK-PROFILE.md`: tables and fields used; `order_items.status` values and counts; the timestamp that defines the date window and why; date coverage; nulls in the used fields; `sale_price` meaning, currency, and decimal precision; ID types; distinct customers and products with a completed item for 1-, 2-, and 5-year scopes; bytes scanned per capability query; Sandbox limits; the date the profile was taken. | Profile document, produced by an approved profiling script whose queries are committed | Not started |
| AC-6 | **BigQuery `DataSource`.** One fixed, backend-owned query per capability. Scope dates are passed only as query parameters. Results follow the handover contract: exactly the registry field names; IDs, names, and categories as strings; money and counts as JS numbers; money summed per item in cents and rounded to 2 decimals as the reference does; no sort, filter, or limit other than an over-cap guard (`LIMIT rowCap + 1`). Every job sets a bytes-billed cap, a timeout, and the dataset location. No email or other unneeded personal field is selected. Any API error, timeout, or cap breach throws. Logs contain only the error class name. | Unit tests with a fake BigQuery client that capture the job request (SQL text contains no scope value; parameters, cap, timeout, location set) and map sample responses (type conversion, NUMERIC values, null handling, errors); an inspection that the SQL selects no email | Not started |
| AC-7 | **Known-answer check.** An opt-in live test fetches the raw completed and non-completed items for at least two small scopes (one including Returned, Cancelled, and Processing items, one crossing a month boundary), runs the reference aggregation (`FixtureDataSource` over that extract) and the BigQuery adapter on the same scopes, and requires **exact equality** of every row and field for both capabilities. At least 3 rows per capability are also checked by hand and recorded. | Live test output and hand checks recorded in `03-implementation-notes.md` | Not started |
| AC-8 | **Row caps (N2).** Each capability's `rowCap` in the registry is set from the profile, so that a 1-year scope fits, with the rationale recorded. The orchestrator option can only lower a cap. Storing a result at the cap in phase C completes within the turn deadline, and session-end cleanup of a capped result stays within its 5 s transaction. | Registry tests; option test (cannot raise); timed integration test at the cap for storage and cleanup | Not started |
| AC-9 | **Claude `LlmClient`.** Sends exactly the `ModelContext` and the user text: a fixed system prompt (instructions and catalogue, marked for prompt caching) and the per-turn context and text. Nothing outside `ModelContext` is added. Requests structured output with `TURN_DECISION_JSON_SCHEMA`, a bounded `max_tokens`, a timeout of at most 30 s, and at most 1 retry. Returns the raw output without validating or repairing it. Throws on an API error, a timeout, a refusal, or a truncated response. Logs only the error class name, never prompts, user text, or output. `demoExamples` is `null`. | Unit tests with a fake transport that capture the request (keys and content limited to context plus text; leak test reused with real-looking rows present in the DB; schema, limits, cache markers) and simulate success, API error, timeout, refusal, truncation | Not started |
| AC-10 | **Model evaluation.** An opt-in script runs an evaluation set built from the demo model's reference pairs, the catalogue's AI-selection examples, and the user's examples in the AI & Data Requirements document, each with an expected decision and a starting state. A case passes when the action type, relevance, capability, and, where the case specifies them, scope dates, refinement, and analysis match. The script reports per-case results, the overall pass rate, tokens, latency, and estimated cost. **Pass threshold:** at least 90% overall and 100% of safety cases (unrelated, causal, or unsupported questions never yield `request_data`, `refine`, or `analyze`). The final result is stored as the Sonnet 5.5 baseline. | Script output and baseline file; summary in the implementation notes | Not started |
| AC-11 | **Credential-free CI and no secret exposure.** Live tests and the evaluation are excluded from `npm test` and CI. They run only through dedicated scripts and skip with a clear message when credentials are missing. CI passes with no secrets. No secret appears in logs, test output, the browser bundle, committed files, or the Docker image. | CI run on the branch; a grep of the web build output for the key variable names; inspection of logs from the live runs | Not started |
| AC-12 | **Real conversation (manual).** With `claude` + `bigquery`, the user completes a browser walkthrough: a first question that retrieves, two refinements without retrieval (sort reversal, filter), an analysis, a request needing different data (switch proposed, then confirmed), an unrelated question, a causal question, a refresh during a turn, and sign-out during a turn followed by a fresh sign-in with an empty session. Measured per-turn latency (model and query) and per-turn cost are recorded. | User confirmation and measurements in the implementation notes | Not started |
| AC-13 | **Docs.** README: Google Cloud and Anthropic setup, the spend limit, the configuration matrix, how to run the live tests and evaluation and what they cost. `example.env` updated. TASK-003 handover items closed or carried over in the closeout. | Inspection | Not started |

## Security, privacy, accessibility, and operations

- **Credentials:** read only from the environment (`ANTHROPIC_API_KEY`) and Google application default credentials (outside the project). Claude never reads, prints, or copies them. Placeholders only in `example.env`. Config errors name variables, never values.
- **Model boundary:** the model receives only `ModelContext` (decision C), never rows, names, or figures. Its output is untrusted, validated by `parseTurnDecision`, and never executed. Prompt injection in user text can at most produce an invalid or unhelpful decision, which the backend already contains.
- **Query safety:** fixed SQL, parameterized scope, read-only public dataset, bytes-billed cap, timeout, and over-cap guard.
- **Personal data:** TheLook is synthetic; only customer ID and display name are selected (no email, address, or location). The data is not described as real.
- **Cost controls:** the Console spend limit (user), `max_tokens`, the existing 200-message limit per session, prompt caching, the BigQuery bytes cap, and approval before each live test or evaluation run.
- **Logging:** error class names only for model and query failures; no prompts, user text, outputs, SQL parameters, or rows.
- **Availability:** a model or BigQuery outage gives the existing generic or retrieval-failed reply and keeps the current result. A crashed turn's marker expires at the deadline.
- **Accessibility:** the in-progress notice uses a polite live region; disabled controls stay visible and explain why; axe passes.

## Test strategy

| Criterion | Test level/type | Important cases | Evidence / command |
|---|---|---|---|
| AC-1 | API integration (test DB), gated fakes | sign-out, replacement sign-in, idle expiry during phase B; refresh during a first turn; concurrent message and Switch → 409; stale marker takeover; marker cleared on every failure path; phase C after session end writes nothing and creates nothing; all TASK-003 orchestrator and conversation tests | `npm test -w api` |
| AC-2 | Web component + axe | refresh mid-turn, polling to completion, 409 keeps typed text, 401 during polling, deadline reached | `npm test -w web` |
| AC-3 | Unit | every value and default; production refusals; missing key or project; secret never in messages | `npm test -w api` |
| AC-4 | Unit / static | import rules; wiring for each config combination | `npm test -w api` |
| AC-5 | Live (approved) | profiling queries | `npm run live:profile -w api`, output in the profile |
| AC-6 | Unit with fake client | parameterization, cap, timeout, location; type mapping incl. NUMERIC and nulls; errors; over-cap guard | `npm test -w api` |
| AC-7 | Live (approved) | mixed statuses; month boundary; both capabilities; exact equality; hand checks | `npm run live:test -w api` |
| AC-8 | Unit + timed integration | cap from registry; option only lowers; store and clean up at the cap | `npm test -w api` |
| AC-9 | Unit with fake transport | request content and limits; leak test; error, timeout, refusal, truncation | `npm test -w api` |
| AC-10 | Live evaluation (approved) | all cases; safety subset; threshold | `npm run live:eval -w api` |
| AC-11 | CI + inspection | CI without secrets; live suites excluded and skipping; bundle grep | CI result reported by the user |
| AC-12 | Manual | the walkthrough steps | User confirmation |
| AC-13 | Inspection | README, `example.env` | Review |

## Definition of Done

- [ ] Every acceptance criterion is met and supported by evidence.
- [ ] Required tests and checks pass (API, web, lint, typecheck, format, builds, audit), and results are recorded.
- [ ] The known-answer check and the evaluation threshold are met; the baseline is stored.
- [ ] Review findings are resolved or explicitly accepted by the user.
- [ ] Documentation, the profile, and known limitations are current.
- [ ] The user completes the manual walkthrough (AC-12).
- [ ] The user accepts closeout; the external CI state is reported accurately.

## Open decisions

- **Anthropic billing** (user, pending): confirm in the Console before plan step 9. If credits don't apply, a Console account with its own spend limit is assumed.
- **Evaluation threshold** (user, recommended above: 90% overall, 100% safety). Approving the spec approves it.
- **Row cap values** (Claude after profiling, user reviews): rule in AC-8.
- **Date-window timestamp** (Claude after profiling): recommended `order_items.created_at` in UTC (when the item was ordered), confirmed or changed by the profile with its rationale.

## Revision history

| Revision | Date | Change | User approval |
|---|---|---|---|
| 1 | 2026-11-08 | Initial draft (DEC-001 to DEC-003 applied) | Approved by the user, 2026-11-08 (including the evaluation threshold) |
