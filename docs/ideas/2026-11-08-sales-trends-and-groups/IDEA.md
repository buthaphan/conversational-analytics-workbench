# Idea: Sales trends and group performance

**Captured:** 2026-11-08 (local time)  
**Status:** Accepted for specification  
**Proposed task ID:** TASK-005  
**Proposed branch:** `feature/TASK-005-sales-trends-and-groups`

## Decision

- **Decision date:** 2026-11-08 (user, after [FUNCTION-REVIEW.md](FUNCTION-REVIEW.md))
- **Chosen scope:**
  - **`sales_time_series`:** revenue, distinct orders, and items per day, week, or month, with optional product filters, shown as a **line chart**.
  - **Period comparison included:** a time series can be compared with a second period ("did sales rise compared with the previous period?"). The user chose this over the recommendation to defer it, accepting a larger task.
  - **Group comparisons:** extend the existing "group" analysis on product sales to **department** and a capped top-N **brand**. No separate `product_group_performance` capability.
  - **Charts:** a **horizontal bar** view, and a **pie** view under a readability rule (few slices; otherwise the app explains and offers an alternative).
- **Left to the specification:** the week definition, partial and empty buckets, how a comparison is shown (two series or change values) and computed, the pie slice limit, horizontal-bar behaviour, which refinements and analyses apply to time buckets, the brand cap, and row caps.
- **Not included:** see "Explicit exclusions" below; `product_group_performance` as a capability is deferred.

## In the user's words/context

After TASK-004, the user chose to extend the analysis with more capabilities and chart types ("go with your option 1"). Proposed after TASK-004: start with sales over time and category or brand performance, which adds the most range to the showcase; line charts come naturally with time series. During the TASK-004 walkthrough the user asked for a "horizontal bar" chart, which is not supported yet.

## Intended outcome

A showcase user can ask how sales change over time and how product groups compare, and get validated, backend-computed answers with a suitable chart. Examples from the capability catalogue:
- "Show monthly sales for the last year"
- "Did sales rise compared with the previous period?"
- "Which category performed best?"
- "Compare brands by revenue"

## Initial constraints

- Follow the existing data and AI model ([AI-DATA-CAPABILITIES.md](../../product/AI-DATA-CAPABILITIES.md)):
  - the model selects and parameterises a capability, and never sees rows or figures;
  - the backend validates and computes;
  - a change of capability or scope needs the user's confirmation.
- Candidate capabilities from the catalogue:
  - `sales_time_series`: revenue, distinct orders, and items per day, week, or month, with optional filters and a comparison period;
  - `product_group_performance`: revenue and items by category, department, or brand.
- Reuse the TASK-004 pattern for each capability:
  - a profile check;
  - a parameterized BigQuery query that matches reference rules;
  - a known-answer check;
  - evaluation cases added to the model baseline, which must stay at its threshold.
- Charts: a line chart for time series; a pie chart for shares, only where it stays readable (few groups). The design system's accessibility rules apply (every chart has its value table).
- Keep CI credential-free; live checks run only with approval; keep within the BigQuery Sandbox and the Anthropic spend limit.

## Unknowns

- Which group dimensions are in scope first: category only, or brand and department too? TheLook has 26 categories and many brands, so brand results may need a cap.
- Week definition (ISO week, Monday start?) and how partial first and last buckets are labelled.
- Whether "compared with the previous period" is in this slice, and how a comparison is shown (two series, or change values).
- Pie chart rules: maximum number of slices, and when to refuse with a readable alternative.
- Whether horizontal bar is included (it helps long product names).
- How the existing analyses (summary, concentration, group) apply to a time series, if at all.
- Row caps and stored-result shape for time buckets.

## Explicit exclusions

- The other six catalogue capabilities (purchase activity, order details, segments, fulfilment, returns, basket affinity).
- Forecasting, causal explanations, or any figure the model computes.
- The AWS showcase, Bedrock, and the TASK-004 hardening items (R2, stuck-turn window, Docker adapters, secret scanning).
- Visual redesign beyond what the new charts need.
