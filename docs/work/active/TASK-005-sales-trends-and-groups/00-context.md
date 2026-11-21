# Task context: TASK-005 Sales trends and group performance

**Branch:** `feature/TASK-005-sales-trends-and-groups`  
**Idea record:** [IDEA.md](../../../ideas/2026-11-08-sales-trends-and-groups/IDEA.md), [FUNCTION-REVIEW.md](../../../ideas/2026-11-08-sales-trends-and-groups/FUNCTION-REVIEW.md) (committed on `main` in `d06bbee`)  
**Status:** In specification

## Accepted intent

A showcase user can ask how sales change over time and how product groups compare, and gets validated, backend-computed answers with a suitable chart. The idea record is canonical; this is a summary.

## Relevant approved decisions

- **`sales_time_series`** (catalogue capability 6): revenue, distinct orders, and items per day, week, or month, with optional product filters, shown as a line chart (IDEA.md, Decision).
- **Period comparison is included** ("did sales rise compared with the previous period?"). The user chose this over the function review's recommendation to defer it.
- **Group comparisons** extend the existing "group" analysis on product sales to department and a capped top-N brand. No separate `product_group_performance` capability.
- **Charts:** horizontal bar, and pie under a readability rule (few slices; otherwise explain and offer an alternative).
- **Unchanged model boundary** ([AI-DATA-CAPABILITIES.md](../../../product/AI-DATA-CAPABILITIES.md)): the model selects and parameterizes; the backend validates and computes; a change of capability or scope needs the user's confirmation.

## Constraints and dependencies

- Reuse the TASK-004 pattern per data change: profile check, fixed parameterized BigQuery query matching the reference rules, known-answer check, evaluation cases; the baseline threshold (90% overall, 100% safety) must still hold ([TASK-004 closeout](../../completed/TASK-004-data-and-ai-adapters/06-closeout.md)).
- Reference rules ([THELOOK-PROFILE.md](../../../product/THELOOK-PROFILE.md)): only `Complete` items; window on `orders.created_at` as a UTC date; each item rounded to cents before summing.
- Design system ([DESIGN-SYSTEM.md](../../../design/DESIGN-SYSTEM.md)): every chart uses `ChartWithTable`; at most six categorical colors; unreadable chart requests are explained with an alternative.
- CI stays credential-free; live checks and evaluation runs only with the user's approval of each run (TASK-004 DEC-002); within the BigQuery Sandbox and Anthropic spend limit.
- Code facts that shape the spec:
  - Product rows hold `category` only, so grouping by department or brand needs `department` and `brand` added to `product_sales_performance` (query, fixture, known-answer check).
  - `request_data` carries only a date scope; a time series also needs a product filter and comparison bounds.
  - The engine, answers, and web views assume entity rows (ID, label) sorted by a measure with a default limit of 10.
  - Group analysis results render only as a table in a chat card; the main result area has bar and table views.

## Open questions

Resolved in [01-spec.md](01-spec.md): week definition, partial and empty buckets, how a comparison is shown and computed, pie slice limit, horizontal-bar behaviour, which refinements and analyses apply to time buckets, brand cap, row caps.

## Next action

Draft the specification and implementation plan, settle the open questions with the user, and request approval.
