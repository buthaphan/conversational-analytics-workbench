# Function review: Sales trends and group performance

**Status:** Recommended, with a narrowed first slice  
**Proposed task ID:** TASK-005  
**Proposed branch:** `feature/TASK-005-sales-trends-and-groups`

## User and problem

Showcase users can rank customers and products for one period, but cannot ask the most common business questions: how sales move over time, and how product groups (category, department, brand) compare. Questions such as "show monthly sales for the last year" or "compare brands by revenue" currently get an "unsupported" reply. The only charts are a vertical bar and a table, so trends and shares are hard to read.

## Value and outcome

- **Range:** time series and group comparisons are the questions a viewer of an analytics showcase is most likely to try. Supporting them demonstrates capability selection, clarification (interval, period), and switching on genuinely different data shapes.
- **Visual evidence:** a line chart for trends, a pie chart for shares where it is readable, and a horizontal bar for long labels (asked for in the TASK-004 walkthrough). Each keeps the exact-values table.
- **Low risk:** the TASK-004 pattern carries over directly (profile, fixed parameterized query, known-answer check, evaluation cases, live checks with approval). The model boundary does not change.

## Candidate scope

- **`sales_time_series`** (catalogue capability 6):
  - revenue, distinct orders, and items per day, week, or month for a validated scope;
  - optional product filters (for example a category).

  Its row count is small: 1,826 daily buckets at most over 5 years.
- **Charts:**
  - **line chart** for time series;
  - **horizontal bar** as a view option for ranked results;
  - **pie chart** only for a small number of shares (for example the existing "group by category" analysis, or a group result with few groups). Otherwise the app explains and offers a readable alternative, as catalogue rule 13 requires.
- **Group performance, one of two shapes** (see Open decisions):
  1. extend the existing "group" analysis to department and brand on the product result, which needs no new retrieval; or
  2. add **`product_group_performance`** (catalogue capability 5) as a new capability with its own query, including period comparison.
- **For each new capability:** registry entry and catalogue text, a fixture extension for credential-free tests, a BigQuery query with a known-answer check, evaluation cases added (the baseline must stay at the 90% and 100%-safety threshold), and answer templates for the new results.

## Exclusions

- The other six catalogue capabilities (purchase activity, order details, segments, fulfilment, returns, basket affinity).
- Forecasting, trend lines, causal statements, or any figure the model computes.
- The AWS showcase, Bedrock, and TASK-004 hardening (R2, stuck-turn window, Docker adapters, secret scanning).
- General visual redesign, which the user plans for a later branch.

## Risks and dependencies

- **The engine assumes entity rows.** `ResultEngine`, the summary and analyses, and the answer templates were built for customer and product rows (an ID and a label). A time series is ordered by time, sorting by value is unusual, and "top 10%" or concentration is not meaningful. The spec must say which refinements and analyses apply to time buckets, and refuse the rest clearly.
- **Overlap with the existing group analysis.** "Revenue by category" already works as an analysis on product sales. A new `product_group_performance` capability must be clearly distinct (new dimensions and period comparison), or the model's capability choice becomes ambiguous and the evaluation drops.
- **Brand cardinality.** TheLook has many brands (not yet profiled), so brand groups need a cap or top-N with "Other". This is not suitable for a pie chart.
- **Time semantics:**
  - UTC day boundaries;
  - week start (ISO Monday);
  - partial first and last buckets;
  - empty buckets (show as zero, not missing);
  - future-dated rows in TheLook (seen in the TASK-004 profile).
- **Model evaluation drift:** adding capabilities changes the prompt, so the existing 37 cases must be rerun alongside the new ones. That costs a few cents per run, with approval.
- **Dependencies:** TASK-004's adapters, live-check tooling, and evaluation baseline; the user's BigQuery and Anthropic setup; ECharts already supports line and pie charts, so no new dependency is expected.

## Open decisions

1. **Group performance shape:** extend the existing group analysis (recommended for this slice: no new query, fast), or add `product_group_performance` with period comparison now?
2. **Period comparison** ("did sales rise compared with the previous period?"): in TASK-005 for time series (two series, or change values), or deferred?
3. **Dimensions:** category and department first, with brand only as a capped top-N?
4. **Week definition:** ISO weeks (Monday start, UTC), with partial buckets labelled?
5. **Pie chart rule:** the maximum number of slices (for example 6), and what to offer instead.
6. **Horizontal bar:** a separate view option, or automatic when labels are long?

## Recommendation

**Proceed to specification with a narrowed first slice:**
- `sales_time_series` (day, week, month) with a line chart;
- horizontal bar and a rule-based pie view;
- group comparisons by extending the existing group analysis to department (and brand as a capped top-N).

Defer the separate `product_group_performance` capability and period comparison to a follow-up, unless the user wants comparison now (decision 2). That keeps one new query and known-answer check, and limits evaluation drift.

This is a recommendation, not approval to build. The user decides the scope; the specification then sets the acceptance criteria.
