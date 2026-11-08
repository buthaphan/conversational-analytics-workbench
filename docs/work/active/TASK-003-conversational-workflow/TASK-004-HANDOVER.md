# TASK-004 handover: real data source and model

TASK-003 built the conversational workflow against two interfaces with fake adapters. TASK-004 replaces the adapters with BigQuery (decision A) and Claude (decision B). Nothing else in the workflow should need to change. The rules, storage, analyses, and answer templates are adapter-independent.

## 1. Where the adapters are chosen

`api/src/analysis/analysis.module.ts` is the only production file that imports a concrete adapter. `api/src/analysis/dependencies.test.ts` enforces this (AC-14). Add the new adapters there:

- `DataSource`: currently `FixtureDataSource`.
- `LlmClient`: chosen by `ANALYSIS_MODEL` (`api/src/config/config.ts`). Today the values are `demo` and `none`. Add `claude`, and decide its default and production rules. `demo` must stay refused in production.

## 2. `DataSource` (`api/src/analysis/data/data-source.ts`)

```ts
abstract fetch(capability: CapabilityId, scope: Scope): Promise<ResultRowData[]>;
```

- **Return:** the **complete** result for the scope, one object per row, with exactly the registry's field names (`api/src/analysis/capabilities/registry.ts`):
  - `customer_spending`: `customer_id`, `customer_name`, `total_spend`, `order_count`, `avg_order_value`
  - `product_sales_performance`: `product_id`, `product_name`, `category`, `revenue`, `item_count`
- **Types:** money and counts are JS numbers. IDs, names, and categories are strings. Do not sort, filter, or limit: the orchestrator stores the complete set and derives every view from it.
- **Failure:** throw. The orchestrator then answers `ANSWERS.retrievalFailed`, keeps the current result, and keeps a pending switch (AC-7). Only the error's class name is logged.
- **Row cap:** the orchestrator refuses results above `CapabilityDef.rowCap` (placeholder `DEFAULT_ROW_CAP = 100_000`). Profile the real data, then set real caps. The cap is checked after `fetch` returns, so a query should also guard its own size or cost (for example a `LIMIT cap + 1`), so an over-cap scope is detected without transferring everything.
- **Scope:** `scope.start_date` is inclusive and `scope.end_date` is exclusive, `YYYY-MM-DD`, validated (at most 5 years). Pass both as query parameters, never by string concatenation.

### Reference aggregation (must match)

`FixtureDataSource` (`api/src/analysis/data/fixture-data-source.ts`) is the reference semantics (TD-12):

| Rule | Reference behavior |
|---|---|
| Items counted | `status = "Complete"` only (not Returned, Cancelled, or Processing) |
| Date window | the item's date in `[start_date, end_date)`. TheLook has several timestamps per item, so record which one TASK-004 uses and why. |
| `total_spend`, `revenue` | sum of `sale_price` of the counted items, summed in cents and rounded to 2 decimals |
| `order_count` | number of **distinct orders** with at least one counted item |
| `avg_order_value` | `total_spend / order_count`, rounded to 2 decimals |
| `item_count` | number of counted items (order lines) |
| Rows included | only customers or products with at least one counted item in the scope |

TASK-004 should add a known-answer check: run the BigQuery query and the reference rules on the same small hand-checked extract and compare. Use the catalogue definitions in `docs/product/AI-DATA-CAPABILITIES.md` where they are more specific.

## 3. `LlmClient` (`api/src/analysis/llm/llm-client.ts`)

```ts
abstract decide(context: ModelContext, userText: string): Promise<unknown>;
readonly demoExamples: string[] | null; // leave null for a real model
```

- **Input:** `ModelContext` (`api/src/analysis/context/model-context.ts`) is the only data the model may receive (AC-5, decision C). It holds the catalogue, the active result's metadata, allowed category values, the last 10 turns (user text, plus past decisions and outcome counts), today's date, and any pending action. It never contains rows or figures; `model-context.test.ts` is the leak test. Do not add anything to the prompt from outside this object.
- **Output:** the raw model output, a JSON string or object. The orchestrator validates it with `parseTurnDecision` (`api/src/analysis/decision/turn-decision.ts`). `TURN_DECISION_JSON_SCHEMA` is the JSON Schema for structured output. Do not validate or repair the output inside the adapter; an invalid decision already fails safely (AC-3).
- **Failure:** throw on API errors, timeouts, or refusals. The user then gets "Sorry, I couldn't process that. Please rephrase." Only the error's class name is logged, never the content.
- **Reference decisions:** `api/src/analysis/llm/demo-llm-client.ts` lists, for each walkthrough sentence, the decision a correct model should return. These pairs are a ready-made evaluation set for the Claude prompt.

## 4. Things to know

- **Transaction length:** each turn runs in one database transaction that holds the analysis session's row lock (TD-6, TD-7), including the model call and the retrieval. The timeout is 120 s (`TURN_TRANSACTION` in `orchestrator.ts`), and each in-flight turn holds one pooled connection. With real latencies, review the timeout and the pool size, or move the model call out of the transaction (keeping the lock semantics).
- **`ANALYSIS_MODEL=none`:** the API starts, and every question gets the generic error. Production defaults to `none` until TASK-004 adds `claude`.
- **Open items from the idea record:** check that Claude Max credits apply to API usage; check BigQuery Sandbox quotas and expiry; estimate per-turn cost; keep credentials out of the repository (secrets come from the environment only, and `example.env` gets placeholders).
