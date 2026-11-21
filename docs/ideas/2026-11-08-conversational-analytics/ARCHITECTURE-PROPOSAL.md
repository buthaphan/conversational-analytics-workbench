# Architecture proposal: Conversational analytics (TASK-003 and TASK-004)

**Revision:** 5 (accepted by the user for specification on 2026-11-08)  
**Inputs:** [AI Data Capability Catalogue](../../product/AI-DATA-CAPABILITIES.md) (what data can be asked for) and the user's AI & Data Requirements document (how the workflow behaves; `docs/product/Conversational_Analytics_Workbench_AI_Data_Requirements_Updated.txt`)  
**Decisions:** [IDEA.md](IDEA.md#decision)

This proposal is the agreed basis for the TASK-003 and TASK-004 specifications. It is not a specification: acceptance criteria, test plans, and exact schemas belong to `/spec-driven`.

## 1. How the two input documents fit together

- The **catalogue** defines the 10 capabilities: what each one returns, its inputs, and when to clarify.
- The **requirements document** defines the conversational workflow: the AI interprets and proposes; the backend validates, retrieves, stores, and refines.
- **No stored procedures exist yet.** The catalogue is the specification for building the 10 capabilities as backend-owned, parameterized, read-only data operations.

Where the two documents differed, these points were settled with the user:
- **Storage:** PostgreSQL, scoped to the login session (as in the catalogue, `CLAUDE.md`, and `PROJECT-SETUP.md`).
- **When to ask:** any change of capability **or scope** needs the user's confirmation.
- **Previous dataset:** discarded when the user confirms a switch.

## 2. Agreed decisions

| Topic | Decision |
|---|---|
| A: data source | BigQuery Sandbox, querying the public TheLook dataset with backend-owned parameterized SQL (one query per capability) |
| B: AI provider | Anthropic API, starting with Claude Sonnet 5.5 (`claude-sonnet-5-5`); compare models later with the same checks. Provider-neutral interface, so Amazon Bedrock can be added for the AWS showcase. |
| C: data boundary | The backend computes and writes every number and finding. The AI receives metadata and context only, never data rows or calculated result figures. |
| Retrieval | The backend decides. Any change of capability or scope proposes a switch and waits for confirmation; then the active result set is replaced. With no active result, the first retrieval needs no confirmation. |
| Storage | PostgreSQL, scoped to the login session, deleted through TASK-001's session-end cleanup point, plus a cascade from `users` |
| First slice | `customer_spending` and `product_sales_performance` |
| Views | Bar chart and table only; pie and other chart types deferred |
| Analysis | Three backend-computed operations on the current dataset (section 5) |
| Relevance | The AI explicitly assesses relevance and need on every turn; the backend validates and enforces |
| Causality | Descriptive findings only; never assert causes (catalogue rule) |
| Delivery | TASK-003: core workflow without credentials. TASK-004: real data and AI adapters. |

## 3. Three data layers

| Layer | What it is | Stored? | Changed by |
|---|---|---|---|
| **Active result set** | All rows returned by the capability for its scope | Yes: `result_sets` (metadata) and `result_rows` (data) | Only a confirmed retrieval, which replaces it |
| **Filtered set** | Active rows matching the current filters (no sort or limit) | No: derived from the active set plus the stored filter settings | Filter refinements |
| **Displayed rows** | The filtered set after sorting and the display limit | No: derived from the stored settings | Sort and limit refinements, view changes |

The view is stored as **settings** (filters, sort, limit, view type) in the analysis session, never as a copy of rows. Removing a filter restores the full data without a retrieval.

## 4. Turn processing

1. **The AI interprets** and returns one schema-validated **TurnDecision**:
   - `relevance`: `active_result`, `other_capability`, or `unrelated`
   - `need`: `answerable_now`, `analysis_on_current`, `new_data`, `unclear`, or `unsupported`
   - `action`: `refine`, `analyze`, `change_view`, `request_data`, `clarify`, or `reply`
   - action details: capability, scope, refinements, analysis (operation, fields, target), view, question, explanation

   It uses structured output rather than forced tool calls, because current Claude models cannot be forced to call a tool.
2. **The backend enforces.** The AI's assessment is advisory; the backend checks the consequences:

| Check | Outcome |
|---|---|
| Fields and operators exist in the active result; same scope; valid values and target | Execute on the stored rows. **No retrieval.** |
| Field present but value missing, invalid, or ambiguous; ambiguous measure; ambiguous analysis target | **Clarify**, listing the valid options |
| Different capability, or same capability with a different scope | **Propose a switch** and wait for confirmation (button or reply). Then retrieve, replace the active result, apply the refinements, and return the result. |
| No active result yet | Retrieve without asking |
| Concept no capability supports, or a causal "why" | **Explain**, then offer the nearest descriptive or supported alternative, or a switch proposal if a capability that can answer exists |
| `unrelated`, or a text-only reply | Text only. No data access, no state change. |
| The AI's claim conflicts with stored facts | The backend's check wins (clarify or propose a switch) |

Pending switches and clarifications are stored in PostgreSQL. A confirmation never depends on the model remembering what it proposed.

## 5. Analytical operations

| Operation | Example | Capabilities |
|---|---|---|
| Summary of a numeric field (count, total, average, median, min, max) | "What's the average spend per customer?" | Both |
| Concentration (share of the total held by the top N or top X%) | "What % of spending comes from the top 10% of customers?" | Both |
| Group by a stored categorical field | "Revenue by category among these products?" | `product_sales_performance` |

**Target rule.** Every analysis names a target:
- `complete` (**default**): all rows in the active result set.
- `filtered`: only when the user explicitly refers to the current filter.
- `displayed`: only when the user explicitly refers to what is on screen ("these 10", "in this table").

If "these" could mean either the filtered set or the displayed rows, the backend asks. Every answer states its base, for example "Based on all 41,862 customers in 2025: …". An analysis appears as its own result card and does not change the view.

**Example:** with the top 10 customers displayed, "What percentage of spending comes from the top 10% of customers?" is computed over the complete active customer dataset.

## 6. What the AI receives

- **The capability catalogue:** descriptions, field meanings, units, metric definitions. Fixed and prompt-cached.
- **The active result summary:** capability, exact scope, row count, fields, current filters, sort, limit, and view.
- **Allowed values for small categorical fields**, for example product categories.
- **Recent turns:** user messages plus past decisions and outcomes, as counts and parameters only.
- **Context:** today's date, and any pending switch or clarification.

**Never sent:** data rows, names, emails, or any computed value from a result.

## 7. Components

- **`ConversationOrchestrator`:** builds context, calls `LlmClient`, validates the TurnDecision, applies section 4.
- **`LlmClient`** (interface): Claude Sonnet 5.5 adapter (TASK-004) and a scripted fake (TASK-003).
- **`CapabilityRegistry`:** per capability, the description, scope schema, refinement schema, output fields and definitions, allowed analyses, query, and row cap.
- **`DataSource`** (interface): BigQuery adapter (TASK-004) and fixed fixture rows (TASK-003).
- **`ResultEngine`:** derives the filtered set and displayed rows, and runs analyses on the chosen target, using parameterized SQL over the stored rows with allow-listed fields only.
- **`AnalysisStore`** (PostgreSQL):
  - `analysis_sessions`: state, view settings, pending switch or clarification
  - `analysis_messages`: conversation turns
  - `result_sets`: metadata for the stored dataset
  - `result_rows`: the complete dataset
- **API:** `POST /api/analysis/messages`, `GET /api/analysis/state` (page refresh), `POST /api/analysis/switch`. Existing session guard, Origin check, and validation apply.
- **Web:**
  - chat panel
  - result area (bar chart or table)
  - analysis result cards
  - active-scope summary
  - clarification, plus **Switch** and **Keep current** buttons

## 8. Delivery split

**TASK-003: core workflow (no credentials).** Everything in sections 3 to 7, using the fake `DataSource` and fake `LlmClient`.
- **Tests:** every row of the section 4 table; the three analyses on each target (including "top 10 displayed, analyse the top 10% of all"); refinements never retrieve; switch confirmation; page refresh; cleanup when the session ends.
- **The user's examples become scripted conversation tests:** "Why did customer spending decline?", "Show product sales instead", "What's the weather today?".
- **CI:** stays credential-free.
- **Limit:** TASK-003 proves the workflow and its enforcement, not the model's understanding of natural language.

**TASK-004: real adapters (needs credentials).**
- **Data:** profile TheLook (field names, the "completed" status definition, date coverage, price meaning) and write the 2 BigQuery queries with a manual known-answer check.
- **Model:** the Claude Sonnet 5.5 adapter.
- **Checks:** tool-selection and relevance checks built from the catalogue examples and the user's examples. They become the baseline for comparing models later.
- **Manual:** a real browser conversation, and setting the result-size cap after measuring.

## 9. Setup, costs, and risks

| | BigQuery Sandbox | Anthropic API |
|---|---|---|
| **Setup (user, TASK-004)** | Google Cloud project (sandbox, no card); enable the BigQuery API; `gcloud auth application-default login`; project ID in `.env` | Console account and an API key for this app; a monthly spend limit; key in `.env` (never read by the coding agent) |
| **Cost** | Sandbox: 1 TB of queries per month free; each TheLook query scans tens of MB, so showcase use is effectively free. A per-query bytes cap guards against mistakes. | Sonnet 5.5: $2 input / $10 output per million tokens, cached input reads about $0.20/M. Rough estimate: about $0.01–0.02 per turn; to be measured. |
| **Risks / limits** | Needs network and the user's Google sign-in; about 1–3 s per query; the real SQL is not exercised in CI (manual known-answer check instead); Docker needs mounted credentials; the AWS showcase will later need a service account | Spending (capped by the limit); a few seconds per turn; low rate limits on new accounts; a text-only reply is treated as a message to the user, never as data |

**Assumption to verify (user):** the user intends to use Claude Max API credits. A Claude Max subscription and Anthropic API (Console) billing are separate accounts. Confirm in the Console that the credits apply to API usage before TASK-004.

**Other risks** (none change the architecture):
- TheLook profiling may adjust metric definitions.
- The model may choose the wrong capability. The backend limits the damage to an extra question; the TASK-004 checks measure it.
- Large results: a full year of `customer_spending` could be tens of thousands of rows. That is fine to store; the browser receives only displayed rows.

## 10. Left for the specification

- The exact TurnDecision schema.
- Each capability's scope, refinement, and analysis definitions.
- The template wording for answers.
- Median calculation and the "top X%" boundary when values tie.
- The fixture size for TASK-003 (the real row cap is set in TASK-004).
