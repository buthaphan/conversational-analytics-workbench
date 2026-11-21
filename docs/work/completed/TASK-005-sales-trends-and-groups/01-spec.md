# Specification: TASK-005 Sales trends and group performance

**Status:** Approved 2026-11-15  
**Revision:** 3  
**Owner:** buthaphan  
**Related idea:** [IDEA.md](../../../ideas/2026-11-08-sales-trends-and-groups/IDEA.md), [FUNCTION-REVIEW.md](../../../ideas/2026-11-08-sales-trends-and-groups/FUNCTION-REVIEW.md); context: [00-context.md](00-context.md)  
**Decision log:** [DECISION-LOG.md](DECISION-LOG.md) (spec decisions S1–S10 are listed below)

## Problem and goal

A showcase user can rank customers and products for one period, but cannot ask how sales move over time or how product groups compare. "Show monthly sales for the last year" gets an "unsupported" reply, and the only charts are a vertical bar and a table.

**Goal:** a signed-in user can ask for sales over time (by day, week, or month, optionally for a category or department, optionally compared with a second period) and for product sales grouped by category, department, or brand. Each answer is computed by the backend and shown with a suitable chart (line, horizontal bar, or pie, plus the existing bar and table) and its exact-values table. The model boundary does not change.

**Measurable outcome:** the known-answer check matches the reference rules exactly for the new and changed queries (AC-13); the model evaluation, with the new cases, meets the existing threshold (AC-14); the user completes a browser walkthrough (AC-16).

## Decisions made for this spec (2026-11-15)

| ID | Decision | Made by |
|---|---|---|
| S1 | Grouping is a **view of the active product result** in the main result area, with its own chart and table. It replaces the chat-card "group" analysis, so there is one way to group. | User |
| S2 | A comparison is shown as **two lines on one chart, aligned by bucket position**, each period's real dates in the table, plus a **period totals** table with the change and % change. | User |
| S3 | **Pie:** at most 6 slices. With more groups, the 5 largest plus one "Other" slice; the answer says how many groups "Other" holds, and the table lists every group. | User |
| S4 | **Horizontal bar** is a view the user asks for, not automatic. | User |
| S5 | Time series data is retrieved as **daily rows** and rolled up to week or month in PostgreSQL. Changing the interval needs no retrieval and no confirmation. Exact because each order falls on exactly one UTC day (profile: the window uses `orders.created_at`). | Recommended; approved with the spec |
| S6 | **Weeks** are ISO weeks (Monday to Sunday, UTC), labelled "Week of 6 Jan 2025". Months are calendar months in UTC. | Recommended; approved with the spec |
| S7 | **Partial and empty buckets:** a first or last bucket not fully inside the period, or one containing today, is marked "(partial)" in the chart, table, and answer. Days with no sales count as zero. Days after today (UTC) are left out, and the answer says so when the requested end is later. | Recommended; approved with the spec |
| S8 | **Comparison baselines:** `previous_period`, `previous_year`, or `custom` dates. The backend computes the first two (the model does no date arithmetic for them). The model asks when the baseline is unclear. | Recommended; approved with the spec |
| S9 | **Time-series product filter:** category or department only. A brand filter on time series, a single-product series, and other dimensions are deferred (brand names can't be validated before retrieval without a list of about 2,000+ names). | Recommended; approved with the spec |
| S10 | **Brand grouping:** the top 20 brands by the sort measure plus "Other", unless the user asks for a different number (1 to 30). Brand values are never listed in the model context. Bar and horizontal-bar charts don't draw the "Other" row; it stays in the table and the answer, with a note under the chart (DEC-001). | Recommended; approved with the spec; the cap is confirmed by the profile; DEC-001 by the user |

## Scope

### In scope

- **Profile additions** for department, brand, and daily sales.
- **Product rows gain `department` and `brand`** (registry, fixture, BigQuery query, known-answer check).
- **`sales_time_series`** capability: daily rows for a period and optional comparison period, rolled up to day, week, or month; one charted measure at a time (revenue, orders, or items).
- **Grouped view** of product results by category, department, or brand (S1, S10).
- **Views:** `bar`, `horizontal_bar`, `line`, `pie`, `table`, with rules for which view suits which result shape (AC-9).
- **Backend-written answers** for the new results.
- **Model contract:** decision schema, catalogue text, demo-model examples.
- **Web:** line chart (one or two series), horizontal bar, pie, grouped table, period totals, and scope summary additions.
- **Known-answer check, evaluation cases, and a new baseline.**
- **Docs:** capability catalogue, profile, design system (chart rules), README.

### Out of scope

- A separate `product_group_performance` capability, and comparing groups across two periods ("which department grew most?").
- Brand or single-product filters on a time series (S9); customer breakdowns of a time series.
- The other six catalogue capabilities.
- Forecasts, trend lines, moving averages, causal statements, or any figure the model computes.
- Visual redesign beyond the new charts; dark mode.
- The AWS showcase, Bedrock, and the TASK-004 hardening items (R2, abandoned-turn window, Docker adapters, secret scanning).

## Assumptions and dependencies

| Item | Owner | Validation |
|---|---|---|
| TheLook `products` has `department` and `brand`, with a small set of departments and a brand count that suits a top-20 cap | Claude | Profile run (AC-1). If brand values are often null, nulls are shown as "Unknown brand" and recorded in the profile. |
| The BigQuery Sandbox, application default credentials, and the Anthropic key and spend limit from TASK-004 still work | User | The first approved live run succeeds |
| Each live run (profile, known-answer, evaluation, smoke call) is approved by the user first (TASK-004 DEC-002) | Claude | Recorded in the implementation notes |
| ECharts (already installed) supports line, horizontal bar, and pie, so no new dependency is needed | Claude | Build; a new dependency would need the user's approval |
| The extended decision schema stays within the structured-output schema limits found in TASK-004 | Claude | Unit test of the schema plus one approved smoke call early (TASK-004 friction note) |

## Acceptance criteria

| ID | Criterion | Verification evidence | Status |
|---|---|---|---|
| AC-1 | **Profile additions** in `docs/product/THELOOK-PROFILE.md`: distinct `department` values and counts; distinct brand count and nulls; products per brand (spread); complete items per day (range, and days with none) for the last 1 and 5 years; bytes and latency of the new queries. The S10 cap (20) and the time-series row cap are confirmed or changed from these figures, with the reason. | Profile document from an approved run of the committed profiling queries | Not started |
| AC-2 | **Product rows gain `department` and `brand`.** `product_sales_performance` rows carry both as strings (kind `category`), in the fixture and in BigQuery, by the same rules (null brand → "Unknown brand"). Both can be used as row filters (`in`) like `category`. **Brand values are never sent to the model:** the model context gives the brand field's description and value count only, and a brand filter is validated by the backend against the stored result. | Registry, fixture, and BigQuery adapter tests; a model-context test with many brands present proving no brand value appears | Not started |
| AC-3 | **Time-series request validation.** `request_data` for `sales_time_series` accepts a scope (existing rules), an optional refinement with the view settings `interval` (`day`, `week`, `month`; default: `day` up to 31 days, `week` up to 92 days, else `month`) and `measure` (DEC-002), and optional retrieval `parameters`: `product_filter` (`category` or `department` with 1–10 values from the profiled lists), and `comparison` (`previous_period`, `previous_year`, or `custom` with dates under the scope rules). `day` is refused for a period (or comparison period) over 366 days, with week or month offered. Parameters, interval, and measure are refused for other capabilities. Every refusal becomes a clarification listing the valid options. | Registry and decision-schema unit tests: each parameter, default, boundary (31/32, 92/93, 366/367 days), unknown value, wrong capability | Not started |
| AC-4 | **Time-series retrieval.** One fixed BigQuery query returns, per UTC day with completed sales, the revenue (per-item cents rule), distinct order count, and item count, for the period and the optional comparison period, with the product filter as a query parameter. The fixture computes the same. Shared code (not the adapters) fills days without sales with zeros and drops days after today. Comparison bounds: `previous_period` is the same number of calendar months immediately before when the period is whole months, otherwise the same number of days before; `previous_year` shifts both dates back one year (29 Feb → 28 Feb). The row cap allows both periods at the 5-year maximum (2 × 1,827 rows); over-cap refusal as in TASK-004. | Fixture and BigQuery adapter unit tests (parameters, no values in SQL text, mapping, errors); pure tests for zero-fill, today cut-off, and baseline dates (month-end, leap day, year boundary) | Not started |
| AC-5 | **Roll-up and series view.** The engine rolls stored days up to the view's interval in SQL. Buckets are chronological and labelled per S6; partial buckets are flagged per S7. The view has one charted measure (`revenue` default, `order_count`, or `item_count`). With a comparison, bucket *k* of the period is paired with bucket *k* of the comparison period; unequal bucket counts leave gaps and the answer says the periods differ in length. **Period totals** give each period's total for each measure, the change, and the % change (none when the comparison total is 0). | Engine integration tests (test DB): day/week/month sums equal the daily sums; ISO week across a year boundary; partial first and last week and month; zero days; alignment with unequal months; totals and % change, including a zero baseline | Not started |
| AC-6 | **Same data or switch.** A time-series request is the same data only when the capability, scope, product filter, and comparison all match; interval and measure are view settings and never trigger a retrieval. A different filter, scope, or comparison (including adding one) is proposed as a switch, and the switch question names what changes ("adds a comparison with 1 Jan – 31 Dec 2024", "only Jeans"). Nothing is retrieved before the user confirms. | Orchestrator integration tests for each difference; existing switch tests pass | Not started |
| AC-7 | **What applies to a time series.** Allowed: change the interval, the measure, and the view (`line`, `bar`, `table`); the `summary` analysis on a measure, which also names the lowest and highest bucket. Refused with a short explanation and an alternative: sorting by value or a row limit ("shown in date order; ask for the highest month instead"), measure filters, `concentration`, grouping, and `pie` or `horizontal_bar` views. | Orchestrator tests for each allowed and refused request; answer text checked | Not started |
| AC-8 | **Grouped view (S1, S10).** A refinement `group_by` (`category`, `department`, `brand`, or `none`) switches the product result's main view to groups. Row filters apply first; each group has its product count, revenue, and items; groups are sorted by the view's measure and direction. Shown: all groups for category and department, the top 20 for brand, or the user's number (1–30); the rest are combined into one "Other (*n* groups)" row whose totals are exact (in bar charts it is listed but not drawn, DEC-001). The scope summary states the grouping. Analyses still run on product rows; the `displayed` target is refused while grouped. The `group` analysis operation is removed, and its cases move to `group_by`. `customer_spending` cannot be grouped. | Engine and orchestrator tests: each dimension, filters first, sort both ways, brand top-20 and user limit, "Other" totals equal the remainder, `none` restores rows, refusal for customers and for `displayed` while grouped | Not started |
| AC-9 | **Views and chart rules.** `change_view` accepts `bar`, `horizontal_bar`, `line`, `pie`, `table` (common names such as "pie chart" or "horizontal bars" are normalized). Rules: product and customer rows: bar, horizontal bar, table; grouped view: bar, horizontal bar, pie, table; time series: line, bar, table. **Pie** (S3): at most 6 slices; with more groups, the 5 largest plus "Other", and the answer says how many groups "Other" holds. An unsuitable view is refused with the reason and the suitable views, and the current view stays. A view change never retrieves. A new result starts in `line` for a time series and `bar` otherwise. | Orchestrator tests for every view × shape pair; pie with 2, 6, 7, and 26 groups | Not started |
| AC-10 | **Answers.** Every figure in a reply comes from backend templates. Time series: interval, measure, period, bucket count, total, partial-bucket and cut-off notes. With a comparison: both periods, both totals, and the change as "up" or "down" by amount and percent, with no causal wording. Grouped view: dimension, shown groups, "Other". Pie: slice rule. | `answers.test.ts` cases for each template, including the zero baseline and the today cut-off | Not started |
| AC-11 | **Web rendering.** The result area renders: a line chart with one series, or two series named by their periods; vertical and horizontal bars; a pie with labelled slices; a table. Each chart uses `ChartWithTable`, so its exact values are in a table (pie: value and share). Time series tables mark partial buckets; with a comparison they list both periods' dates and values and the change. The period totals table appears under a compared series. In a grouped bar or horizontal-bar chart, an "Other" row is in the table but not drawn, and a note under the chart names it and its share (DEC-001). The scope summary shows interval, product filter, comparison period, and grouping. Pie colors come from the categorical palette; no raw colors. No horizontal page scroll at 320 px. | Web component tests for each view and shape; axe on each; existing design-system guardrail tests pass | Not started |
| AC-12 | **Model contract.** The decision schema adds `request_data.parameters` and `refinement.group_by`, `refinement.interval`, and `refinement.measure`, and `change_view` takes the new views; the parser still rejects unknown keys. Catalogue text for `sales_time_series` and the updated `product_sales_performance` guide the choice (catalogue questions such as "Which category performed best?" → product sales grouped by category). The JSON schema is accepted by the API (one approved smoke call before the evaluation). The demo model gains example sentences for a monthly series, a comparison, grouping by category, and a pie. | Decision-schema and model-context unit tests; demo-model tests; smoke-call result in the implementation notes | Not started |
| AC-13 | **Known-answer check.** The opt-in live check is extended so the reference aggregation over a raw extract and the BigQuery adapter agree exactly for: product rows with department and brand; time-series daily rows for one scope crossing a month boundary with mixed statuses, with a category filter, and with a comparison period. At least 3 rows per query are also checked by hand. | Live output and hand checks in `03-implementation-notes.md` | Not started |
| AC-14 | **Model evaluation.** About 20 new cases: time series (interval, scope, filter, each comparison baseline, an unclear baseline → clarify), grouping (each dimension, brand with a number), views (line, pie, horizontal bar; a pie on a time series), and refusals (forecast, causal "why did sales drop?"). Existing `group` cases are updated to `group_by`. The full set meets **at least 90% overall and 100% of safety cases**; the result replaces the Sonnet 5.5 baseline file. | Evaluation output and baseline; summary in the implementation notes | Not started |
| AC-15 | **Regression and CI.** All existing tests pass (updated only where this spec changes behaviour, each noted in the implementation notes). Live suites stay out of `npm test`; CI passes with no secrets. | `npm test`, lint, typecheck, build; CI result reported by the user | Not started |
| AC-16 | **Walkthrough (manual).** With `claude` + `bigquery`, the user completes: monthly revenue for a year; switch to weekly (no retrieval); orders as the measure; a comparison with the previous year (switch confirmed); a category-filtered series; the highest month; a pie request on the series (refused with an alternative); product sales grouped by category, then as a pie, then by brand as horizontal bars; a forecast request (refused). Per-turn latency and cost are recorded. | User confirmation; measurements in the implementation notes | Not started |
| AC-17 | **Docs.** The capability catalogue reflects S1 and the deferred `product_group_performance`; the profile (AC-1); the design system's chart rules (views per shape, pie rule, horizontal bar); README live-check notes and costs. | Inspection | Not started |

## Security, privacy, accessibility, and operations

- **Model boundary unchanged:** the model sees catalogue metadata, scope and parameters, counts, and allowed values only, never rows, figures, or brand values (AC-2). Its output is validated; parameters are enums, bounded lists from the profile, or dates.
- **Query safety:** fixed SQL per capability; dates, filter values, and comparison bounds are query parameters; bytes-billed cap, timeout, location, and over-cap guard as in TASK-004. Grouping and roll-up run in PostgreSQL with field names from the registry only and bound values.
- **Privacy:** product and aggregated sales data only; no new personal fields.
- **Cost:** the time-series query scans the same tables as the product query (about 10 MB). The evaluation grows from 37 to about 57 cases (a few cents per run); each live run needs approval.
- **Accessibility:** every chart has its table and text alternative; pie slices carry text labels, not color alone; partial buckets are marked in text; axe passes; reflow at 320 px.
- **Failure:** retrieval or model failure keeps the current result (existing behaviour); refusals change nothing.

## Test strategy

| Criterion | Test level/type | Important cases | Evidence / command |
|---|---|---|---|
| AC-1 | Live (approved) | profiling queries | `npm run live:profile -w api` |
| AC-2 | Unit + integration | new fields in both sources; null brand; brand filter validated by backend; no brand value in model context | `npm test -w api` |
| AC-3 | Unit | each parameter; interval defaults and boundaries; wrong capability; schema rejects unknown keys | `npm test -w api` |
| AC-4 | Unit | parameters not in SQL text; mapping; zero-fill; today cut-off; baseline dates (month-end, leap day, year boundary); row cap | `npm test -w api` |
| AC-5 | Integration (test DB) | roll-up sums; ISO week across a year; partial buckets; alignment; totals; zero baseline | `npm test -w api` |
| AC-6 | Integration | each parameter difference proposes a switch; interval and measure don't | `npm test -w api` |
| AC-7 | Integration | each allowed and refused request | `npm test -w api` |
| AC-8 | Integration | dimensions; filters first; sort; brand cap; user limit; "Other" exact; `none`; refusals | `npm test -w api` |
| AC-9 | Integration | view × shape matrix; pie with 2, 6, 7, 26 groups | `npm test -w api` |
| AC-10 | Unit | each template; zero baseline; cut-off; no causal words | `npm test -w api` |
| AC-11 | Web component + axe | each view and shape; partial marks; comparison table; scope summary | `npm test -w web` |
| AC-12 | Unit + live smoke (approved) | schema; catalogue text; demo examples; API accepts the schema | `npm test -w api`; smoke call |
| AC-13 | Live (approved) | product with department and brand; daily series with mixed statuses, filter, comparison; hand checks | `npm run live:test -w api` |
| AC-14 | Live evaluation (approved) | all cases; safety subset; threshold | `npm run live:eval -w api` |
| AC-15 | Full suite + CI | everything | `npm test`, lint, typecheck, build; CI |
| AC-16 | Manual | walkthrough steps | User confirmation |
| AC-17 | Inspection | catalogue, profile, design system, README | Review |

## Definition of Done

- [ ] Every acceptance criterion is met and supported by evidence.
- [ ] Required tests and checks pass (API, web, lint, typecheck, format, builds, audit), and results are recorded.
- [ ] The known-answer check and the evaluation threshold are met; the new baseline is stored.
- [ ] Review findings are resolved or explicitly accepted by the user.
- [ ] Documentation, the profile, and known limitations are current.
- [ ] The user completes the walkthrough (AC-16).
- [ ] The user accepts closeout; the external CI state is reported accurately.

## Open decisions

- **Brand cap and time-series row cap** (Claude after profiling; user reviews): defaults in S10 and AC-4, confirmed or changed in AC-1.
- Approving this spec approves S5–S10.

## Revision history

| Revision | Date | Change | User approval |
|---|---|---|---|
| 1 | 2026-11-15 | Initial draft (S1–S4 decided by the user) | Approved by the user, 2026-11-15 (including S5–S10) |
| 2 | 2026-11-15 | DEC-001: "Other" not drawn in bar charts (S10, AC-8, AC-11); caps confirmed by the profile (brand 20, time series 4,000) | Approved by the user, 2026-11-15 (DEC-001) |
| 3 | 2026-11-15 | DEC-002: interval and measure are refinement (view) settings; `parameters` holds product filter and comparison (AC-3, AC-12) | Approved by the user, 2026-11-15 (DEC-002) |
