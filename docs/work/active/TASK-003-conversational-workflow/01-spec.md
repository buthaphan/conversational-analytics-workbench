# Specification: TASK-003 Conversational workflow (core, without credentials)

**Status:** Approved (2026-11-08)  
**Revision:** 1  
**Owner:** User  
**Related idea:** [IDEA.md](../../../ideas/2026-11-08-conversational-analytics/IDEA.md), [ARCHITECTURE-PROPOSAL.md](../../../ideas/2026-11-08-conversational-analytics/ARCHITECTURE-PROPOSAL.md) (revision 5), [00-context.md](00-context.md)  
**Decision log:** [DECISION-LOG.md](DECISION-LOG.md)

## Problem and goal

The workbench has sign-in and a design system, but no analytics. Users need an analytical conversation in which the AI interprets intent and relevance, while the backend controls every data operation and writes every number. The workflow must be fully built and proven without cloud credentials, so TASK-004 only has to plug in BigQuery and Claude.

**Goal:** a signed-in user can ask, refine, analyse, change the view, and switch datasets with confirmation, over two capabilities (`customer_spending`, `product_sales_performance`), using fake data and AI adapters.

**Success is measured by:**
- automated tests for every enforcement rule, data layer, and analysis target;
- scripted conversations for the user's examples;
- a manual walkthrough in the browser with the development demo model.

## Scope

### In scope

- **Storage:** analysis sessions, conversation messages, the active result set and its rows, all in PostgreSQL, scoped to the login session and deleted when it ends.
- **Capability registry** for `customer_spending` and `product_sales_performance`: scope, fields, refinements, analyses, allowed values, and row cap.
- **TurnDecision:** a schema and validator for the AI's per-turn structured decision.
- **Orchestrator:** builds the model context and applies the backend enforcement rules (refine, analyse, change view, clarify, switch, explain, reply).
- **Result engine:** derives the filtered set and displayed rows, and runs three analyses (summary, concentration, group by category) on a named target.
- **Backend-written answers:** templates for every result, analysis, and refusal.
- **Interfaces with fake adapters:**
  - `DataSource` (fake: a deterministic fixture);
  - `LlmClient` (fake: a scripted model for tests, plus the development demo model, DEC-001).
- **API:** `GET /api/analysis/state`, `POST /api/analysis/messages`, `POST /api/analysis/switch`.
- **Web workspace:**
  - active-scope summary;
  - result area (bar chart or table);
  - analysis result cards;
  - chat;
  - clarification, and **Switch** / **Keep current** buttons;
  - demo-mode banner and example prompts.
- **Documentation:** README and project docs updated.

### Out of scope

- BigQuery, TheLook profiling, the Claude adapter, prompt design, tool-selection checks, and the real row cap: all TASK-004.
- The remaining 8 capabilities, pie and other chart types, and any "explain results" feature that sends figures to the AI.
- Saving or restoring past analysis sessions; exporting data; voice input.
- Changes to login, logout, or session rules.
- AWS deployment.

## Assumptions and dependencies

- TASK-001 and TASK-002 are merged (they are, at `d30688f`). Local PostgreSQL runs in Docker, as for TASK-001.
- **One new runtime dependency, needing approval at implementation:** `zod` (current stable). See TD-3. Any substitution is recorded in the implementation notes.
- No credentials and no network services. CI stays as it is, with PostgreSQL as a service and no secrets.
- **"Today"** comes from the injectable `Clock`, which tests control. Fixture dates span 2024-01-01 to 2026-11-08.

## Technical design and trade-offs

Each item states the choice, the reason, and what is traded away. Each is approved together with this spec unless you change it.

**TD-1. A single structured decision per turn, not several AI "tools".**
- **Choice:** the model returns one JSON object (TurnDecision, below) that must match a schema.
- **Why:** current Claude models cannot be forced to call a tool, but structured output can be required. A single object also guarantees that the relevance assessment is present on every turn, and it is simpler to validate and test.
- **Trade-off:** the schema must cover every action. TASK-004 maps it to the Anthropic structured-output feature.

**TD-2. The backend decides retrieval by comparing facts, not by trusting the AI.**
- **Choice:** for every decision, the backend compares the requested capability, scope, fields, and values with the stored active result, using the rule table in AC-6.
- **Why:** this is the core safety property. A wrong or "forgetful" model can cause at most an extra question, never a silent retrieval or a wrong data operation.
- **Trade-off:** the AI's `relevance` and `need` fields are advisory, used for wording and logging. When they conflict with the facts, the backend's check wins.

**TD-3. `zod` for schemas** (TurnDecision and each capability's parameters).
- **Why:** one definition gives TypeScript types, runtime validation, and a JSON Schema export (`z.toJSONSchema`) that TASK-004 will send to Claude as the structured-output schema. With `class-validator`, already in use for request bodies, the JSON Schema would have to be hand-written and kept in sync.
- **Trade-off:** one more runtime dependency. Request-body validation stays on `class-validator`, for consistency with TASK-001.

**TD-4. Store the complete result once; keep the view as settings.**
- **Choice:**
  - `result_rows` holds every row of the active result set as JSON (`jsonb`), one table row per data row.
  - The filtered set and displayed rows are never stored. They are derived from the active set plus the view settings (filters, sort, limit, view type) kept on the analysis session.
- **Why:** it guarantees analyses can always use the complete data (the target rule), removing a filter needs no retrieval, and there is one source of truth.
- **Trade-off:** each refinement re-reads from the stored rows. TD-5 keeps that efficient.

**TD-5. Refinements and analyses run as SQL over the stored rows.**
- **Choice:** filters, sorts, limits, counts, summaries, concentration, and grouping run as parameterized SQL over `jsonb` in PostgreSQL. Only the displayed rows and the computed figures leave the database.
- **Why:** a full year of `customer_spending` can be tens of thousands of rows (about 10–20 MB). Loading it into the API on every follow-up would be slow; SQL is fast and exact (including medians and window functions).
- **Safety:** field names come only from the capability registry (never from the AI or the user), each mapped to a typed SQL expression; values are always bound parameters.
- **Trade-off:** more complex SQL than in-memory TypeScript. Covered by known-answer tests on hand-built results.

**TD-6. Replacing the active result is one transaction.**
- **Choice:** in one transaction: insert the new result set and its rows, point the session at it, delete the previous set (its rows go with it), reset the view to the requested refinements, and clear the pending switch.
- **Why:** a crash can never leave two active sets or none.
- **Trade-off:** a large insert holds the transaction longer. Rows are inserted in batches; acceptable at showcase scale.

**TD-7. One turn at a time per analysis session.**
- **Choice:** each `POST` locks the session's row (`SELECT … FOR UPDATE`) for the duration of the turn.
- **Why:** two tabs sending at once would otherwise race on the pending switch and view settings. The same pattern fixed TASK-001's cleanup race.
- **Trade-off:** a second request waits for the first. Fine for one user.

**TD-8. Pending actions live in the database.**
- **Choice:** a pending switch (capability, scope, refinements, reason) or a pending clarification (the question) is stored on the analysis session.
- **Confirmation:** comes from the **Switch** / **Keep current** buttons, or from a reply that the model classifies as `confirm_switch`.
- **Any other new message** clears the pending switch, treated as "keep current".
- **Why:** a confirmation never depends on the model remembering what it proposed.

**TD-9. The model context is built by one function and tested for leaks.**
- **Choice:** `buildModelContext()` produces exactly the content listed in AC-5.
- **Leak test:** fills the stored result with recognisable values and asserts that none of them appears in the context.
- **Why:** decision C is verified by a test, not just intended.

**TD-10. All user-facing answers come from backend templates.**
- **Choice:** every result, analysis, and refusal message is a template filled with backend-computed values and formatted by the backend (currency, counts, percentages, dates).
- **Model-written text:** the model's own text is limited to the clarification question and the reply or explanation, and it never has data values to repeat.
- **Trade-off:** answers are less conversational than free-form text, but every figure is verifiable.

**TD-11. The demo model is a separate adapter that is refused in production** (DEC-001).
- **Choice:** `ANALYSIS_MODEL=demo` selects it, and it maps a fixed list of normalized example sentences to TurnDecisions.
- **Guard:** the API refuses to start with `demo` when `NODE_ENV=production`, the same pattern as the TASK-001 seed guard.
- **Trade-off:** the demo cannot show natural-language understanding. That arrives with TASK-004.

**TD-12. The fake data source aggregates a deterministic fixture.**
- **Choice:**
  - A seeded generator produces about 400 customers, 120 products in 8 categories, and their order items from 2024-01-01 to 2026-11-08, with fixed statuses.
  - The fake `DataSource` computes each capability's rows from that fixture for the requested scope, counting only completed items.
- **Why:** realistic shapes for the browser and the integration tests, with no network.
- **Trade-off:** the fixture's aggregation becomes a reference implementation that TASK-004's BigQuery queries must match. TASK-004 compares the two with a known-answer check.

## Capability definitions (TASK-003)

| | `customer_spending` | `product_sales_performance` |
|---|---|---|
| **Scope (retrieval)** | `start_date` (inclusive), `end_date` (exclusive); both required, end after start, span of at most 5 years | Same |
| **Fields** | `customer_id` (id), `customer_name` (label), `total_spend` (USD), `order_count` (integer, completed orders), `avg_order_value` (USD) | `product_id` (id), `product_name` (label), `category` (categorical), `revenue` (USD), `item_count` (integer, completed items) |
| **Filters** | `total_spend`, `order_count`, `avg_order_value` with `>`, `>=`, `<`, `<=`, `between` | `revenue`, `item_count` (same operators); `category` with `in` (allowed values only) |
| **Sort** | One numeric field, ascending or descending; ties broken by id | Same |
| **Limit (displayed rows)** | 1–100, default 10 | Same |
| **Analyses** | Summary (numeric field); concentration (by `total_spend` or `order_count`) | Summary; concentration (by `revenue` or `item_count`); group by `category` |
| **Default bar chart** | Label = `customer_name`, value = the sort field | Label = `product_name`, value = the sort field |
| **Row cap** | Configurable; a test value in TASK-003 (TASK-004 sets the real one) | Same |

Field meanings, units, and definitions are part of the registry and are sent to the model (AC-5).

## TurnDecision (summary; the exact schema is in code)

| Field | Values |
|---|---|
| `relevance` | `active_result` · `other_capability` · `unrelated` |
| `need` | `answerable_now` · `analysis_on_current` · `new_data` · `unclear` · `unsupported` |
| `action.type` | `refine` · `analyze` · `change_view` · `request_data` · `confirm_switch` · `clarify` · `reply` |

Action details by type:
- **`refine`:** filters, sort, limit, `clear_filters`.
- **`analyze`:** operation, field or measure, top N count or top X percent, `group_by`, and `target` (`complete` · `filtered` · `displayed`, default `complete`).
- **`change_view`:** view (`bar`, `table`, or an unsupported name, which is refused).
- **`request_data`:** capability, scope, refinements.
- **`confirm_switch`:** accept true or false.
- **`clarify`:** the question.
- **`reply`:** the message, plus a reason (`unrelated`, `unsupported`, or `causal`).

## Acceptance criteria

| ID | Given / when / then or measurable criterion | Verification evidence | Status |
|---|---|---|---|
| AC-1 | **Storage and cleanup.** A migration adds `analysis_sessions` (one per login session; the active result pointer, view settings, and pending action), `analysis_messages`, `result_sets`, and `result_rows`. Analysis data is deleted when the login session ends for any reason (sign-out, replaced, idle, maximum age) through a registered `SessionCleanupRegistry` step, and also when the user is deleted (cascade from `users`). Cleanup finishes well inside the transaction timeout for a maximum-size result. | Constraint and cleanup integration tests for each end reason and for user deletion; a timing test at the row cap | Not started |
| AC-2 | **Capability registry.** Both capabilities are defined as in the table above, with validated scope, filters, sort, limit, analyses, and allowed category values. Invalid or unknown fields, operators, values, or scopes are rejected with a reason the orchestrator can turn into a clarification. | Unit tests per capability (valid and invalid cases) | Not started |
| AC-3 | **TurnDecision validation.** Each model response is validated against the schema. Invalid JSON, schema violations, an unknown action, or an inconsistent combination (for example `analyze` without an operation) lead to a safe failure: the reply "Sorry, I couldn't process that. Please rephrase.", no data access, no state change, and an error type logged without content. | Unit tests, plus orchestrator tests with a scripted invalid response | Not started |
| AC-4 | **First retrieval.** With no active result, a valid `request_data` retrieves the complete result for the scope, stores it, applies the requested refinements, and returns the displayed rows with no confirmation question. | Orchestrator and API tests (DataSource called exactly once) | Not started |
| AC-5 | **Model context (decision C).** The context contains only: the catalogue entries for both capabilities (descriptions, field meanings, units, definitions, scope rules, clarification rules); the active result summary (capability, scope, row count, fields, filters, sort, limit, view); allowed categorical values; up to the last 10 turns (user text, plus past decisions and outcomes as counts and parameters); today's date; and any pending action. It contains **no data rows, no customer or product names or IDs from results, and no computed figures** (totals, averages, shares). | Leak test: the context is generated from a stored result with recognisable values and asserted free of all of them | Not started |
| AC-6 | **Backend enforcement.** For each decision the backend applies, in order: <br>(a) same capability, same scope, valid fields, operators, values, and target, so it executes on the stored rows with **no retrieval**; <br>(b) a field or measure is present but the value is missing, invalid, or ambiguous, or the analysis target is ambiguous, so it **clarifies**, listing the valid options; <br>(c) a different capability, or the same capability with a different scope, so it **proposes a switch** (stored; no retrieval) using the wording from the requirements document; <br>(d) the switch target is clear but its scope is missing with nothing to carry over, so it clarifies the scope first; <br>(e) unsupported concepts, causal "why" questions, and unrelated questions get a **reply**: no data access, no state change, plus a supported alternative where one exists; <br>(f) a decision whose claim conflicts with the stored facts follows the facts. For a `refine` that omits scope, the scope is inherited from the active result. | Orchestrator tests: one case per rule, with the DataSource call count asserted | Not started |
| AC-7 | **Switch confirmation.** A pending switch is confirmed by **Switch** (`POST /api/analysis/switch`) or by a reply classified as `confirm_switch` (accept). Then, in one transaction, the complete new result is retrieved and stored, replaces the previous one (deleted), the requested refinements become the view, and the filtered result is returned. **Keep current**, `confirm_switch` (decline), or any other new message clears the pending switch and leaves the active result and view unchanged. A confirmation with no pending switch returns a clear message and changes nothing. | Orchestrator and API tests, including a failure during retrieval (the old result stays active and the pending switch is kept) | Not started |
| AC-8 | **Three data layers.** Only the complete active result is stored; filters, sort, limit, and view are stored as settings. Refinements change only settings: clearing filters restores the full result without retrieval. The state reports `rowCount` (complete), `filteredCount`, and the displayed rows. | Result-engine and orchestrator tests | Not started |
| AC-9 | **Analyses and targets.** Summary (count, total, average, median, min, max), concentration (top N or top X%, by an allowed measure), and group by `category` (product count, revenue, item count per category). The target is `complete` by default, and `filtered` or `displayed` only when the decision names it. Each answer states its base (for example "Based on all 412 customers, 1 Jan–31 Dec 2025: …"). An analysis does not change the view. **Top X%:** k = ⌈X% × n⌉ rows by the measure, descending, ties broken by id. **Median:** the average of the two middle values when n is even. | Known-answer tests on hand-built results for each operation and target, including: with the top 10 displayed, "top 10% of customers" is computed over all rows; ties; even n; empty filtered set | Not started |
| AC-10 | **Backend-written answers.** Every figure shown to the user comes from backend templates with consistent formatting: currency with 2 decimals for money, thousands separators, percentages to 1 decimal place, dates as `1 Jan 2025` with the exclusive end shown as the last included day. Model-written text appears only for clarification questions and replies. | Template unit tests; orchestrator tests asserting the source of each figure | Not started |
| AC-11 | **Row cap.** If a retrieval would exceed the capability's row cap, nothing is stored or replaced, and the user gets an explanation asking for a narrower scope. Results are never silently truncated. | Orchestrator test with a low configured cap | Not started |
| AC-12 | **API.** `GET /api/analysis/state`, `POST /api/analysis/messages` (text, 1–500 characters), `POST /api/analysis/switch` (`switch` or `keep`). <br>**Protection:** signed-in only (session guard), POSTs checked by the Origin guard, validated bodies, `Cache-Control: no-store`, and a user can reach only their own session's data. <br>**Concurrency:** one turn at a time per session (TD-7). <br>**Limit:** at most 200 messages per analysis session; after that, a message asks the user to sign out and in to start fresh. | HTTP integration tests (401 without a session, 403 for a bad Origin, 400 for invalid bodies, isolation between two users, concurrent POSTs serialized) | Not started |
| AC-13 | **Refresh and session end.** After a page refresh, `GET /api/analysis/state` returns the same active result, view, pending action, and recent messages. After sign-out (or any session end), the user starts with an empty analysis session. | API tests; web test for refresh | Not started |
| AC-14 | **Fake adapters.** `DataSource` and `LlmClient` are interfaces. The fake data source computes both capabilities from the deterministic fixture (completed items only) for any valid scope. The scripted fake model returns queued decisions for tests. Production code depends only on the interfaces. | Unit tests for the fake data source against small hand-computed fixtures; dependency check that production modules import only the interfaces | Not started |
| AC-15 | **Development demo model (DEC-001).** With `ANALYSIS_MODEL=demo`, normalized example sentences map to TurnDecisions covering every workflow path (at least the 12 in the walkthrough, AC-18). Unknown text gets "Demo mode: try one of these examples" with the list. The web app shows a "Demo mode" banner and clickable example prompts. The API refuses to start with `demo` when `NODE_ENV=production`. | Unit tests for the phrase mapping; startup refusal test; web component test for the banner and prompts | Not started |
| AC-16 | **Web workspace.** Replaces the placeholder in the signed-in shell, using design-system components only. <br>**Content:** the active-scope summary (capability, dates, row count, active filters); the result area as a bar chart of displayed rows (with its table, per TASK-002) or table-only; analysis result cards with figures and their base; a chat log with a labelled input and Send (loading state); clarification questions; switch prompts with **Switch** and **Keep current** buttons; and an empty state before the first question. <br>**Accessibility:** new assistant messages are announced (polite live region), focus stays in the input after sending, keyboard-operable throughout, 320 px reflow, and axe clean for each state. | Component tests (RTL, mocked fetch) with axe for each state | Not started |
| AC-17 | **Scripted conversations.** API-level tests drive these conversations with the scripted model and assert DataSource calls and state after each turn: <br>1. "Who spent the most last year?" → clarify calendar or trailing year → load → top 10 <br>2. "Show the lowest spenders" → refine, no retrieval <br>3. "Only customers who spent over $500" → refine, no retrieval <br>4. "What share of spending comes from the top 10% of customers?" → concentration on the complete set while the top 10 is displayed <br>5. "Show this as a table" → view change, no retrieval <br>6. "Show it as a pie chart" → refused; bar offered <br>7. "Who spent the most in 2023?" → switch proposal (scope) → keep <br>8. "Why did customer spending decline?" → reply (descriptive, not causal; the current data covers one period), with an offer <br>9. "Show product sales instead" → switch proposal → Switch → product result <br>10. "Top-selling products" → clarify revenue or units <br>11. "Only the Jeans category" → refine <br>12. "What's the weather today?" → unrelated reply; state unchanged | API integration tests | Not started |
| AC-18 | **Manual walkthrough.** In a browser with the demo model, the user runs the 12 conversations of AC-17 through the example prompts and confirms the results, the scope summary, the switch buttons, the refresh behavior, and keyboard use. | Checklist in the implementation notes, completed by or with the user | Not started |
| AC-19 | **Docs and CI.** The README explains the workspace and demo mode. `example.env` documents `ANALYSIS_MODEL` (and any new settings). The TASK-004 handover lists the interfaces to implement and the reference aggregation. CI runs all new tests with no credentials. | Inspection; CI run reported by the user | Not started |

## Security, privacy, accessibility, and operations

- **Data to the AI:** metadata and context only, verified by the leak test (AC-5). No data leaves the app in TASK-003 at all.
- **Injection:** user text goes only into the model context. Model output is untrusted: it is schema-validated, field names come from the registry, values are bound SQL parameters, and nothing the model returns is executed.
- **Authorization:** every query is scoped to the caller's analysis session, which is derived from the session cookie, never from request parameters. Cross-user access is tested.
- **Data lifecycle:** analysis data is deleted at session end and on user deletion (AC-1). There are no logs of message text or data values; logs record event types and counts only.
- **Abuse limits:** message length 500, 200 messages per session, one turn at a time, result row cap.
- **Production guard:** the demo model is refused in production.
- **Accessibility:** WCAG 2.2 AA through the design system, live-region announcements, keyboard operation, 320 px reflow (AC-16).
- **Operations:** no new services. One migration. The fixture is generated deterministically at runtime, so no large files are added to the repository.

## Test strategy

| Criterion | Test level/type | Important cases | Evidence / command |
|---|---|---|---|
| AC-1 | Integration (PostgreSQL) | Each end reason; user deletion; FK constraints; cleanup time at the row cap | `npm test -w api` |
| AC-2 | Unit | Valid and invalid scopes, fields, operators, values; allowed categories | `npm test -w api` |
| AC-3 | Unit + orchestrator | Malformed JSON, missing fields, unknown action, inconsistent combos; no state change | `npm test -w api` |
| AC-4 | Orchestrator + HTTP | First retrieval with refinements; one DataSource call | `npm test -w api` |
| AC-5 | Unit (leak test) | Recognisable names, IDs, and figures absent; pending action present; 10-turn window | `npm test -w api` |
| AC-6 | Orchestrator | One case per rule (a)–(f); DataSource call count; inherited scope | `npm test -w api` |
| AC-7 | Orchestrator + HTTP | Button and text confirmation, decline, implicit clear, no-pending confirm, retrieval failure | `npm test -w api` |
| AC-8 | Result engine | Filter, sort, limit, clear filters; counts | `npm test -w api` |
| AC-9 | Result engine (known answers) | Each operation × each target; ties; even n; empty set; base statement | `npm test -w api` |
| AC-10 | Unit | Currency, separators, percentages, date ranges (exclusive end) | `npm test -w api` |
| AC-11 | Orchestrator | Over-cap retrieval stores nothing and keeps the old result | `npm test -w api` |
| AC-12 | HTTP | 401, 403, 400, cross-user isolation, concurrent POSTs, message limit | `npm test -w api` |
| AC-13 | HTTP + web | Refresh returns the same state; empty after sign-out | `npm test` |
| AC-14 | Unit + dependency check | Fixture aggregation on small hand-computed data; completed items only; scope bounds | `npm test -w api` |
| AC-15 | Unit + startup + web | Phrase mapping; unknown text; production refusal; banner and prompts | `npm test` |
| AC-16 | Component (RTL) + axe | Empty state, result (bar and table), analysis card, clarification, switch prompt, demo banner, error | `npm test -w web` |
| AC-17 | HTTP scripted conversations | The 12 conversations | `npm test -w api` |
| AC-18 | Manual | Walkthrough checklist | Notes, by or with the user |
| AC-19 | Inspection + CI | Docs; credential-free CI | Review; user-reported CI |

Concurrency and boundary cases are planned from the start, following TASK-001's lessons:
- simultaneous messages (TD-7);
- a switch confirmed while another message arrives;
- the analysis target with ties.

Tests stay fast: the fixture is small, and there is no real cryptography in these paths.

## Definition of Done

- [ ] Every acceptance criterion is met and supported by evidence.
- [ ] Required tests and checks pass, and the results are recorded.
- [ ] Review findings are resolved or explicitly accepted by the user.
- [ ] Documentation, the TASK-004 handover, and known limitations are current.
- [ ] The user completes the manual walkthrough (AC-18).
- [ ] The user accepts closeout; the external CI state is reported accurately.

## Open decisions

None blocking. Decided: [DEC-001](DECISION-LOG.md#dec-001--browser-demonstration-in-task-003) (demo model). Approved together with this spec unless you change them:

- TD-1 to TD-12, including adding `zod` (TD-3) and SQL over stored rows (TD-5).
- The capability definitions table, including the limit range 1–100 (default 10) and the scope maximum of 5 years.
- Limits: 500 characters per message, 200 messages per session, a 10-turn context window.
- Concentration ties broken by id; median as the average of the middle two values for even n.
- Any new message clears a pending switch (treated as "keep current").
- Number and date formatting rules (AC-10).

## Revision history

| Revision | Date | Change | User approval |
|---|---|---|---|
| 1 | 2026-11-08 | Initial draft, with DEC-001 and the proposals under Open decisions | Approved by user, 2026-11-08 |
