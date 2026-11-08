# Task context: TASK-004 Real data and AI adapters

**Branch:** `feature/TASK-004-data-and-ai-adapters` (from `main` at `bf43a01`)  
**Idea record:** [IDEA.md](../../../ideas/2026-11-08-conversational-analytics/IDEA.md), [ARCHITECTURE-PROPOSAL.md](../../../ideas/2026-11-08-conversational-analytics/ARCHITECTURE-PROPOSAL.md) (revision 5), [FUNCTION-REVIEW.md](../../../ideas/2026-11-08-conversational-analytics/FUNCTION-REVIEW.md)  
**Status:** Spec revision 1 and plan approved 2026-11-08; implementation not started

## Accepted intent

Replace TASK-003's fake adapters with real ones, so a signed-in user holds a real conversation about TheLook data:
- Profile TheLook and write BigQuery queries for `customer_spending` and `product_sales_performance`.
- Add a Claude Sonnet 5.5 `LlmClient` adapter.
- Check tool selection and relevance assessment against the real model.
- Hold a real end-to-end conversation.

The workflow, rules, storage, analyses, and answer templates from TASK-003 should not need to change. The idea record remains canonical.

## Relevant approved decisions

- **A:** BigQuery Sandbox with the public TheLook dataset, backend-owned parameterized queries ([IDEA.md](../../../ideas/2026-11-08-conversational-analytics/IDEA.md#decision)).
- **B:** Anthropic API, starting with Claude Sonnet 5.5; compare models later with the same checks.
- **C:** The backend generates all numbers; the model receives `ModelContext` only (metadata and context, never rows or figures).
- Capability semantics: [AI-DATA-CAPABILITIES.md](../../../product/AI-DATA-CAPABILITIES.md).
- **DEC-002 (TASK-003):** R1 and R7 (turn lock vs. session end and refresh) are deferred to this task and must be fixed before the Claude model is enabled ([TASK-003 DECISION-LOG](../../completed/TASK-003-conversational-workflow/DECISION-LOG.md)).

## Building on existing work

- **Interfaces and contract:** [TASK-004-HANDOVER.md](../../completed/TASK-003-conversational-workflow/TASK-004-HANDOVER.md): `DataSource` and `LlmClient` contracts, the reference aggregation rules (`FixtureDataSource`), adapter wiring in `analysis.module.ts` (enforced by `dependencies.test.ts`), `ANALYSIS_MODEL` config, row caps, and the demo model's reference decisions as an evaluation set.
- **Closeout limitations:** [TASK-003 06-closeout.md](../../completed/TASK-003-conversational-workflow/06-closeout.md#limitations-and-pending-decisions).

## Constraints and dependencies

- **Required work:** fix R1 and R7, with slow-turn tests (session end, sign-in elsewhere, refresh during a turn). Per the TASK-003 retrospective, list every other code path that touches the analysis-session row.
- **N2:** set real row caps in the registry only, after profiling.
- **Known-answer check:** the BigQuery query must match the reference rules on a small hand-checked extract. Record which TheLook timestamp defines the date window, and why.
- **Credentials:** secrets come from the environment only; `example.env` gets placeholders. Never read or copy real credential files. The user sets up GCP and Anthropic accounts and keys.
- **CI stays credential-free:** tests that need BigQuery or the Anthropic API must be opt-in and skipped without credentials.
- **`demo` stays refused in production.** `ANALYSIS_MODEL=claude` is new; its default and production rules are decided in the spec.
- New dependencies (BigQuery client, Anthropic SDK) need the user's approval. Network access and API calls cost money and need approval.
- No admin features; do not change login or logout behavior.

## Open questions

- Do the user's Claude Max credits apply to Anthropic API (Console) usage? (To confirm with the account; likely billed separately.)
- BigQuery Sandbox quotas, table expiry, and how to authenticate locally (application default credentials vs. a service account key kept outside the project).
- Per-turn token cost estimate and any spend limit.
- R1/R7 approach: take the model decision outside the lock, bound cleanup's lock wait, or both.
- Real row caps per capability, after profiling.
- How the real-model evaluation runs (opt-in script vs. opt-in test suite), which cases it covers, and the pass threshold.
- Request timeout and retry policy for both adapters.

## Next action

Run `/implementation` against [01-spec.md](01-spec.md) revision 1 and [02-implementation-plan.md](02-implementation-plan.md). DEC-001 to DEC-003: [DECISION-LOG.md](DECISION-LOG.md).
