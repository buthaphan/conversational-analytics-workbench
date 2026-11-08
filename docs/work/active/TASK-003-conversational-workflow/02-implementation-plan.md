# Implementation plan: TASK-003 Conversational workflow

**Spec revision:** 1 (draft, pending approval)  
**Status:** Draft

| Step | Behavior / change | Acceptance criteria | Test-first step | Dependencies |
|---|---|---|---|---|
| 1 | Ask the user to approve installing `zod`. Add the migration for `analysis_sessions`, `analysis_messages`, `result_sets`, `result_rows`, with cascades from `auth_sessions` and `users`. | AC-1 | Constraint and cascade tests red before the migration, then green | User approval |
| 2 | Register the analysis cleanup step with `SessionCleanupRegistry`; timing at the row cap. | AC-1 | Tests for each end reason and for user deletion, red then green | 1 |
| 3 | Capability registry for both capabilities (scope, fields, filters, sort, limit, analyses, allowed values, row cap). | AC-2 | Valid/invalid unit tests, red then green | 1 |
| 4 | TurnDecision schema and validator; safe failure on invalid output. | AC-3 | Unit tests for malformed and inconsistent decisions, red then green | 3 |
| 5 | Fixture generator and fake `DataSource` (completed items only, scope bounds). | AC-14 | Hand-computed aggregation tests, red then green | 3 |
| 6 | Result engine: filtered set, displayed rows, counts (SQL over `jsonb`). | AC-8 | Filter/sort/limit/clear tests on hand-built results, red then green | 1, 3 |
| 7 | Result engine: summary, concentration, group by, with targets. | AC-9 | Known-answer tests per operation × target, ties, even n, empty set, red then green | 6 |
| 8 | Answer templates and formatting. | AC-10 | Template tests, red then green | 7 |
| 9 | Model context builder. | AC-5 | Leak test red, then green | 3, 6 |
| 10 | `LlmClient` interface and scripted fake; orchestrator with the enforcement rules, pending actions, the switch transaction, the row cap, and one turn at a time. | AC-4, AC-6, AC-7, AC-11 | Orchestrator tests per rule and per confirmation path, red then green | 4–9 |
| 11 | API endpoints with guards, validation, `no-store`, isolation, and the message limit. | AC-12, AC-13 | HTTP tests, red then green | 10 |
| 12 | Scripted conversations (the 12 cases). | AC-17 | Conversation tests, red until the remaining gaps are closed | 11 |
| 13 | Demo model, `ANALYSIS_MODEL` setting, production refusal. | AC-15 | Phrase-mapping and startup tests, red then green | 10 |
| 14 | Web workspace: state loading, scope summary, result area (bar/table), analysis cards, chat, clarification, switch buttons, demo banner and prompts, refresh. | AC-13, AC-15, AC-16 | Component tests with axe per state, red then green | 11, 13 |
| 15 | Documentation and the TASK-004 handover; `example.env`; CI check. | AC-19 | Inspection | 1–14 |
| 16 | Final verification and the manual walkthrough with the user. | AC-18, all | Not test-first; results recorded | 1–15 |

## Verification sequence

1. During each red/green cycle, run only the focused tests (API tests need `docker compose up -d postgres`).
2. After step 15, run from a clean install: `npm ci`, `db:generate`, `format:check`, `lint`, `typecheck`, `test`, `build`. Run the API suite several times to check for flakiness (the concurrency tests). Ask before running `npm audit` (network).
3. Step 16 with the user, then `/task-review`.

## Risks / coordination

- **SQL over `jsonb`** (TD-5) is the most intricate part. Known-answer tests on hand-built results come first, and the field-to-SQL mapping is generated only from the registry.
- **Switch transaction and concurrency** (TD-6, TD-7). Test simultaneous messages and a retrieval failure from the start (TASK-001 lesson).
- **Scope of the demo model:** keep it a fixed phrase table; it is not a language model.
- **TASK-004 handover:** the fake data source's aggregation is the reference that the BigQuery queries must match; record it clearly.
