# Implementation notes: TASK-005 Sales trends and group performance

**Spec revision:** 3 (approved 2026-11-15; steps 1–3 were done under revision 1)  
**Branch:** `feature/TASK-005-sales-trends-and-groups`

## Starting state

- Branch verified; working tree clean except a one-line blank-line edit in `api/src/analysis/llm/claude-llm-client.ts` that was not made in this task. Left untouched for the user.

## Step 1: Profile additions (AC-1)

- **Change:** `api/src/live/profile.live.ts` gains ten `task005_` queries: departments, categories per department, brand values (nulls, blanks, case variants, length), products per brand, brand revenue spread (top 5/20/30 share), daily sales (last 1 and 5 years), future-dated orders, and draft product and daily queries (counted, for rows and bytes). Same rules as the capability queries: `Complete` items, window on the order's UTC date, cents per item.
- **Checks:** `npm run typecheck -w api` exits 0; Prettier run on this file only.
- **Live run** (approved by the user, 2026-11-15): `npm run live:profile -w api -- -t task005`.
  - First attempt: 7 of 9 passed. The two draft queries failed with a BigQuery syntax error because `rows` is a reserved word. The alias was renamed to `row_count`, and the same approved run was repeated with `--silent=false` so the output was shown.
  - Second attempt: 9 of 9 passed, about 36 MB processed in total.
  - Results are in [THELOOK-PROFILE.md](../../../product/THELOOK-PROFILE.md), under "Departments, brands, and daily sales".
- **Caps:** brand top 20 kept (S10); time-series row cap 4,000 (AC-4).
- **Finding for the user:** the top 20 brands hold only about 22% of revenue, so "Other" is about 78% (see the open question below).

## Step 2: Product rows gain department and brand (AC-2, first part)

- **Tests first** (red, 7 failing for the expected reasons: missing fields, SQL, and mapping):
  - `registry.test.ts`: product field list includes `department` and `brand`; both are kind `category`.
  - `fixture-data-source.test.ts`: the tiny fixture's rows carry department and brand, and a null brand becomes "Unknown brand"; the generated fixture has both departments, more than 20 brands with 2025 sales, and products without a brand.
  - `bigquery-data-source.test.ts`: SQL selects and groups by `p.department` and `p.brand`; mapping includes both; a null brand becomes "Unknown brand"; a null department is refused (never null in the profile).
- **Implementation:**
  - `data-source.ts`: shared `UNKNOWN_BRAND`.
  - `registry.ts`: two new category fields on `product_sales_performance`.
  - `fixture-data-source.ts`: products get a department and an invented brand (30 names, 3 products without one). Both are derived from the product index, not the random sequence, so all existing fixture data is unchanged.
  - `bigquery-data-source.ts`: query and mapping. The SQL returns the source brand; the label is applied in the mapping, as in the reference.
  - `known-answer.live.ts`: the extract carries department and brand, so it compiles against the new `Fixture`. The equality checks are extended in step 15.
- **Green:** the 3 focused files pass, 57 tests. `npm run typecheck -w api` exits 0. ESLint clean and Prettier applied on the changed files only.
- **Regression (partial):** Docker Desktop was not running, so the PostgreSQL test database was unavailable. Tests were run with a scratch config, outside the project, that omits only the migration global setup. All 14 database-free files pass. The 18 database-backed files failed only on the connection; none failed for another reason. They must be rerun once the database is up, in particular the model context, engine, and orchestrator tests, which see the two new fields.
- **Known effect until step 3:** brand values are listed in the model context's allowed values. Step 3 removes them, before any live model call.

## Step 3: Brand values stay out of the model context (AC-2, second part)

- **Regression gap from step 2 closed:** with Docker running (`docker compose up -d postgres`), the full API suite ran: 430 passed, 2 failed. Both failures were expected effects of step 2: `allowedValues` now includes department and brand, but the test rows lacked them. Both tests were updated in this step.
- **Tests first** (red, 5 failing for the expected reasons):
  - `registry.test.ts`: `brand` has `listValues: false`, and category and department are listed. A brand filter passes with a stored value. An unknown or empty brand is refused without `validOptions`, and its message names no stored brand.
  - `model-context.test.ts`: the product seed has 50 brands named "Brandsecret NN". None of them may appear in the serialized context (added to the leak list). `allowedValues` holds category and department only, `valueCounts` is `{ brand: 50 }`, and an empty session has `valueCounts: {}`.
  - `result-engine.test.ts` (updated, green from the start): `allowedValues` still returns every brand, which the backend validation needs. Product test rows gained department and brand.
- **Implementation:**
  - `registry.ts`: optional `listValues: false` on a field (set on `brand`). A refused filter on such a field states the unknown name and "Names must match exactly", and lists no options. This matters because the question is stored as the pending clarification, which goes back to the model.
  - `model-context.ts`: new `valueCounts`. Fields with `listValues: false` are counted instead of listed.
  - `claude-llm-client.ts`: the system prompt explains `valueCounts` and to use the user's brand name exactly. The cached prompt changes, so the evaluation in step 16 covers it.
  - `eval/cases.ts`: states gain `valueCounts`. Product states now list departments and give an approximate brand count of 2,000; the cases themselves come in step 16.
  - `claude-llm-client.test.ts`: fixture context gains `valueCounts`.
- **Orchestrator evidence** (`orchestrator.test.ts`, written after the registry change, so no separate red phase): a refused brand filter's reply and pending question name no stored brand; a valid brand filter works with no new retrieval. Product test rows gained department and brand.
- **Checks:** full API suite 435 passed, 0 failed (103 suites); typecheck exits 0; ESLint and Prettier on the changed files only.
- **Known limitation (recorded for AC-17 docs):** brand filters need the exact name (case-sensitive), because the model cannot see the list. A near-miss gets a clear refusal.

## Step 4: Decision schema and time-series validation (AC-3, AC-12 schema part; part of AC-4)

- **Decision first:** [DEC-002](DECISION-LOG.md). The user chose to make interval and measure refinement (view) settings, so `parameters` holds only the product filter and comparison. Spec revision 3.
- **Tests first** (red: 27 failing, then 4 more for comparison dates; all failed because the functions or fields were missing):
  - `turn-decision.test.ts`: accepts a time-series request with no parameters, with a filter, comparison, interval, and measure, with each baseline, with a department filter, and `group_by` for each value. Rejects a custom comparison without dates, a previous-period comparison with dates, an unknown baseline, a brand filter, an empty filter, more than 10 values, an unknown interval, an extra parameter, and an unknown `group_by`. The rejection cases passed from the start, because the strict schema already refuses unknown keys; they stay as guards.
  - `registry.test.ts`:
    - interval defaults at 31/32 and 92/93 days;
    - `day` up to 366 days, refused at 367 with week or month offered, also for a custom comparison and for a previous-year period that gains a leap day;
    - unknown category or department, listing the profiled values; empty filter;
    - custom comparison with bad, missing, or over-5-year dates;
    - unknown measure;
    - the 26 categories and 2 departments;
    - other capabilities refuse parameters, interval, and measure, both in a request and in a later refinement;
    - comparison periods: whole months (including across a year), days (including across a leap February), previous year (including 29 February), custom.
- **Implementation:**
  - `turn-decision.ts`:
    - `refinement` gains `group_by` (enum), `interval` (enum), and `measure`.
    - `request_data` gains `parameters`: `product_filter` with category or department and 1–10 values, and `comparison`, a union of three shapes in which custom dates are required.
  - `registry.ts`:
    - `Refinement` gains the three fields; `validateRefinement` refuses interval and measure for the existing capabilities.
    - New time-series section: `SALES_TIME_SERIES` (an ID only; the registry entry comes with the retrieval in step 6), `THELOOK_CATEGORIES`, `DEPARTMENTS`, `periodDays`, `defaultInterval`, `comparisonPeriod`, and `validateRequestParameters`.
  - `eval/cases.ts`: uses the registry's category and department lists instead of its own copy.
- **Pulled forward from step 6:** `comparisonPeriod` and its date tests (AC-4). The 366-day limit has to apply to the comparison period, and a previous-year period can be one day longer than the main period.
- **Test correction:** one new registry case was wrong. Its 367-day custom comparison (1 Jan 2023 – 2 Jan 2024) actually had 366 days, because 2023 is not a leap year. The end date was moved to 3 Jan 2024; the implementation was unchanged.
- **Schema limit:** the structured-output schema now has **24 optional properties, exactly the API's limit** (counted with a scratch script outside the project). The TASK-004 guard test passes. Removing `analysis.group_by` in step 10 brings it to 23. Step 5's smoke call confirms the API accepts it.
- **`change_view`:** no schema change. It already takes any view name up to 32 characters; the backend normalizes and checks names in step 11.
- **Checks:** full API suite 482 passed, 0 failed (107 suites); typecheck exits 0; ESLint and Prettier on the changed files only.

## Step 5: Smoke call with the extended schema (AC-12, API part)

- **Live run** (approved by the user, 2026-11-15): one evaluation case through the real API, `EVAL_CASES=demo-01` with `npm run live:eval -w api -- --silent=false`.
- **Result:** the API accepted the structured-output schema with 24 optional properties. `demo-01` passed (action `clarify`), served by `claude-sonnet-5-5`, 9.6 s, 110 input and 86 output tokens plus a 5,165-token cache write, estimated cost about $0.014.
- **Note:** the run's summary shows the date as 2026-11-14 because the script records the UTC date.
- No baseline was saved. The full evaluation and new baseline come in step 16.

## Step 6: `sales_time_series` retrieval (AC-4)

- **Design:**
  - Adapters implement a new abstract `DataSource.fetchDailySales`, which returns days with completed sales only, one row per period and UTC day.
  - The shared `DataSource.fetchTimeSeries` works out the periods (`seriesPeriods`, using step 4's `comparisonPeriod`). It then applies `completeDailySeries`: zero days, keep today, drop later days. So the fixture and BigQuery cannot differ on those rules.
  - A row from an adapter that falls outside its period, belongs to a period that was not requested, or repeats a day is an error, which the orchestrator reports as a failed retrieval.
  - An over-cap adapter result is passed through unchanged, so the orchestrator's TASK-004 refusal applies.
- **Deviation from the plan wording:** `sales_time_series` is **not yet added to `CAPABILITIES`**. That would put it in the model context and let the orchestrator store it before the engine (step 7) and orchestrator (step 8) handle it. The registry entry moves to step 8. Step 6 adds only `TIME_SERIES_ROW_CAP` (4,000, AC-1).
- **Tests first** (red: 32 failing on "not implemented" stubs or, for the BigQuery error tests, the wrong error class):
  - `time-series.test.ts` (new):
    - periods with and without a comparison, and with custom dates;
    - zero-fill; today kept and later days dropped, including future-dated sales; a period entirely after today; each period completed separately; overlapping periods; month end and leap day;
    - adapter rows refused when before the period, on the exclusive end date, for an unrequested period, or repeated;
    - `fetchTimeSeries` passes both periods and the filter, and passes an over-cap result through;
    - the cap covers 2 × 1,827 rows.
  - `fixture-data-source.test.ts`:
    - hand-computed daily sums (cents, distinct orders, items);
    - category filter; department filter with one value and with both;
    - comparison rows tagged with their period; overlapping periods;
    - completion end-to-end;
    - on the generated fixture, daily revenue and items equal the product result's totals for 2025.
  - `bigquery-data-source.test.ts`:
    - dates, comparison flag and dates, filter field and values, and row limit sent only as typed parameters (none of the values appear in the SQL text);
    - the same SQL text for every request; the `Complete` and cents rules; UTC `DATE(o.created_at)`; no `ORDER BY`;
    - mapping (numeric strings accepted);
    - six malformed rows refused; query failures wrapped with no details.
  - The four "refuses an adapter row" cases passed during the red run only because the stub threw. They became meaningful once the real code was in.
- **Implementation:**
  - `data/time-series.ts` (new): types, `seriesPeriods`, `completeDailySeries`.
  - `data-source.ts`: abstract `fetchDailySales` and shared `fetchTimeSeries`.
  - `fixture-data-source.ts`: `fetchDailySales`, using the same filtering and cents rules as the product query.
  - `bigquery-data-source.ts`: fixed `DAILY_SALES_SQL`. A `CROSS JOIN UNNEST` of two period structs is switched by `@has_comparison`; the filter is `@filter_field` plus `@filter_values ARRAY<STRING>`. Also adds `dailySalesRequest` (static, for the known-answer dry run in step 15) and `dailyRow` mapping. `QueryRequest` params and types now allow booleans and string arrays.
  - `registry.ts`: `TIME_SERIES_ROW_CAP`.
  - `orchestrator.test.ts`: its test data source implements `fetchDailySales` (it returns no rows; time series reach the orchestrator in step 8).
- **Not yet verified live:** the BigQuery SQL (array-of-struct `UNNEST`, an empty `ARRAY<STRING>` parameter) is checked only against a fake runner. The approved known-answer run in step 15 covers it.
- **Checks:**
  - Focused: 3 files, 61 tests pass.
  - `npm run typecheck` exits 0.
  - ESLint clean and Prettier applied on the changed files only.
  - Full API suite (after `docker compose up -d postgres`): 519 passed, 0 failed (33 files). The logged errors come from tests that simulate failures.

## Step 7: Roll-up, partial buckets, comparison, and period totals (AC-5)

- **Tests first** (`result-engine.test.ts`, test DB; red: 9 failing on a "not implemented" stub, the 19 existing tests passing). Stored rows are built with step 6's `completeDailySeries`, as the orchestrator will store them.
  - Month roll-up: zero month, labels, real first and last days, totals.
  - On the generated fixture for 2025, day (365), week (53), and month (12) buckets each sum exactly to the daily revenue (in cents), orders, and items; the day label is "6 Jan 2025".
  - ISO weeks across a year boundary ("Week of 30 Dec 2024" holds 31 Dec and 2 Jan).
  - Partial first and last week; partial first and last month.
  - The bucket containing today is partial (month and day); later days are not stored.
  - Comparison of 31 vs 28 days: separate buckets, `lengthsDiffer`, bucket *k* paired with bucket *k*.
  - Totals with change and % change (up, down, and no change); a zero comparison total gives no % change.
- **Implementation:**
  - `result-engine.ts`: new `series(resultSetId, { periods, interval, measure, today })`.
    - One SQL query groups the stored days by period and `date_trunc(interval)`, with the interval as a bound value and `'week'` as the ISO week. A second query totals each period. Revenue is summed as `numeric` and rounded to cents.
    - Partial (S7): the whole bucket starts before the period, ends after it, or contains today.
    - Change: computed in whole cents for revenue; `percent` is null when the comparison total is 0.
    - Returns `main`, optional `comparison`, `lengthsDiffer`, and `totals` (`main`, `comparison`, `change`). Every bucket carries all three measures, and `measure` names the charted one.
  - `answers.ts`: `formatBucketLabel` (S6 labels), next to the existing date formatting. The engine imports it; `answers.ts` imports only types from the engine, so there is no runtime cycle.
- **Checks:**
  - Engine and answers tests: 39 pass.
  - API typecheck exits 0.
  - ESLint clean and Prettier applied on the changed files only.

## Step 8: Loading a time series, same data or switch (AC-6)

- **Tests first** (`orchestrator.test.ts`, 17 new cases, written before the code). **No red run was recorded:** I implemented before running them, so this step has no demonstrated red phase. The tests pass against the implementation and check behaviour that did not exist before (the capability was undefined).
  - **First request:**
    - retrieves daily rows only (no entity retrieval) and stores 365 days;
    - starts as `line`, by month, on revenue;
    - with a filter and a comparison, retrieves both periods (365 + 366 rows) and stores the parameters;
    - applies a requested interval and measure on load;
    - for the current year, cuts off at today (FakeClock 2026-11-08, 312 days) with "Nov 2026" partial.
  - **Same data:** the same comparison period expressed differently (custom vs `previous_year`), or filter values in another order, needs no retrieval and applies the new interval. So does a repeated request for the same series. Interval and measure refinements never retrieve.
  - **Switch:** each of a different category, no filter, a department filter, an added comparison, a removed comparison, and a different scope is proposed, not retrieved. The question names the change ("only Tops & Tees", "all products", "adds a comparison with 1 Jan 2024 – 31 Dec 2024", "no comparison", "the period …").
    - Confirming retrieves both periods with the filter and replaces the result.
    - A switch from product sales to a series describes the series with its filter.
  - **Refusals (clarify, no retrieval):**
    - an unknown category, listing the options;
    - daily buckets over 366 days, offering week or month;
    - an unknown measure on the loaded series;
    - time-series parameters on `customer_spending`.
  - **Other:** a refresh returns the same state; the model context carries the active series' parameters and view settings.
- **Implementation:**
  - `registry.ts`:
    - `sales_time_series` is now in `CAPABILITIES` (deferred from step 6). Its fields are date, revenue, orders, and items; row cap 4,000; preliminary catalogue text, finalized in step 13.
    - New `EntityCapabilityId` type for the two row capabilities. `DataSource.fetch`, `CAPABILITY_SQL`, and the known-answer check use it, so an entity retrieval can never be asked for a time series.
    - New `sameParameters`: the same filter as a set of values, and the same *resolved* comparison period.
  - **Storage:** migration `20261115120000_time_series_parameters` (hand-written, like TASK-004's) adds nullable `parameters JSONB` and `as_of DATE` to `result_sets`. `as_of` is the retrieval date: the series is cut off at it, and its bucket stays partial on later views, even after midnight. Prisma client regenerated.
  - `orchestrator.ts`:
    - `planRequest` validates parameters, interval, and measure (step 4's `validateRequestParameters`) before the same-data check. A series is the same data only when its parameters match too.
    - Loads, switches, and the pending switch carry `parameters`. Phase B calls `fetchTimeSeries` with today's UTC date and hands `asOf` to phase C.
    - A series starts as `line` with the default interval and revenue. A refine on a series re-checks interval and measure against its periods.
    - The state carries `parameters` and `series` (engine `series` view); `rows` is empty for a series.
  - `engine/result-engine.ts`: `ViewSettings` gains `line`, `interval`, `measure`.
  - `answers.ts`:
    - `switchQuestion` describes a series with its filter and comparison. Between two series it names what changes; entity switches keep their wording.
    - New basic `seriesAnswer` (measure, interval, period, filter, bucket count, total, comparison total). Step 12 completes it (partial and cut-off notes, change wording) with `answers.test.ts` cases.
  - `model-context.ts`: `activeResult.parameters` for a series.
- **Existing tests updated (behaviour change, noted):**
  - `registry.test.ts`: the capability list now includes `sales_time_series` (with its fields and cap). The "undefined capability" example is now `repeat_purchase_behavior`.
  - `model-context.test.ts`: the catalogue lists three capabilities.
  - `orchestrator.test.ts`: the "refuses a capability the registry does not define" case uses `repeat_purchase_behavior`.
- **Interim limits until later steps:**
  - Sort, limit, filters, and `summary` on a series are not yet refused or adapted (step 9).
  - `change_view` still offers only bar and table (step 11).
  - The web cannot render a series yet (step 14).
- **Checks:**
  - Full API suite: 549 passed, 0 failed (33 files).
  - `npm run typecheck` exits 0 (API and web).
  - ESLint clean on `src/analysis`; Prettier applied on the changed files only.

## Step 9: What applies to a time series (AC-7)

- **Tests first** (red: 16 failing; the 8 passing were cases already allowed before, plus the existing refusal of a summary on a non-measure field):
  - `registry.test.ts`:
    - allowed: interval, measure, clearing filters, `group_by: none`, and a summary of each measure;
    - refused with an alternative: sort, row limit, measure filter, and `group_by` category/department/brand; also concentration and the `group` analysis. The refusal names the bucket of the current or requested interval ("highest or lowest week").
  - `orchestrator.test.ts`:
    - a summary over the 12 monthly buckets names the lowest and highest bucket, states the filter, and returns a card with `buckets` and the month nouns;
    - with no measure named, the summary uses the charted measure at the current interval (53 weeks);
    - each refusal (sort, limit, measure filter, grouping, concentration) changes nothing and retrieves nothing.
- **Implementation:**
  - `registry.ts`: `validateRefinement` takes the series' current interval. A series refuses sort, limit, value filters, and grouping, with "Sales over time is shown in date order. Ask for the highest or lowest month instead." and similar messages. `validateAnalysis` refuses concentration and grouping on a series.
  - `result-engine.ts`: `summarizeSeries` summarizes the main period's buckets at the view's interval (in cents for revenue), naming the first lowest and first highest bucket. The summary result gains optional `buckets` (interval, lowest and highest labels).
  - `answers.ts`: a series summary answer ("…average $0.83 per month, median $0.00, lowest $0.00 (Feb 2025), highest $10.00 (Jan 2025)."). `analysisAnswer` takes the series' parameters; `INTERVAL_NOUNS` is exported for the card's row noun.
  - `orchestrator.ts`: a series summary defaults to the charted measure and is computed from the rolled-up series. Refinements pass the current interval to the registry.
- **Decision within scope:** a summary covers the **main period only**. With a comparison, the period totals (AC-5) already give both periods. Partial buckets are included, as they are buckets of the period.
- **Left for step 11:** changing the view between `line`, `bar`, and `table`, and refusing `pie` and `horizontal_bar` (the view × shape matrix).
- **Checks:**
  - Full API suite: 573 passed, 0 failed (33 files).
  - `npm run typecheck` exits 0.
  - ESLint clean and Prettier applied on the changed files only.

## Step 10: Grouped view of product results (AC-8)

- **Tests first** (red: 28 failing for the expected reasons; 3 of them are step 9's series tests, whose helper now passes the current view as an object):
  - `registry.test.ts`:
    - product groupings are category, department, and brand; customers have none;
    - allowed: each dimension, brand with a number, `none`, a brand number while grouped by brand, and a 100-row product limit when not grouped;
    - refused: a brand number outside 1–30 (when grouping and while grouped); a number of groups for category or department ("Every category is shown when grouped by category."); grouping customers, with an alternative.
  - `turn-decision.test.ts`: rejects the removed `group` analysis and `group_by` on an analysis.
  - `result-engine.test.ts` (replaces the old group analysis test):
    - category groups (product count, revenue, items) and department groups;
    - filters apply first; sort by measure and direction, ties by name;
    - 25 brands at cents values: top 20 by default plus an "Other" row of 5 groups whose total plus the shown groups equals the whole to the cent; the user's number (3); lowest-first order; no "Other" when all are shown.
  - `orchestrator.test.ts`:
    - a first request with `group_by` loads grouped;
    - grouping customers is refused;
    - grouping by category needs no retrieval and keeps the product rows;
    - brand with `limit: 1` gives "Other" with exact totals and keeps the product row limit 10;
    - brand defaults to 20; `none` restores rows; a brand number over 30 is refused;
    - analyses still run on product rows while grouped, and the `displayed` target is refused;
    - a refresh returns the same state.
  - `demo-llm-client.test.ts`: "Revenue by category" becomes `refine { group_by: "category" }`.
- **Implementation:**
  - `turn-decision.ts`: the analysis `operation` is `summary` or `concentration`; `analysis.group_by` is removed. The structured-output schema now has 23 optional properties (the TASK-004 guard test passes).
  - `registry.ts`:
    - product `groupByFields` are category, department, and brand;
    - `validateRefinement` takes a `ViewContext` (series interval, current grouping);
    - new `groupingIssue` rules; `DEFAULT_BRAND_GROUPS` (20) and `MAX_BRAND_GROUPS` (30);
    - the `group` analysis branch is removed.
  - `result-engine.ts`:
    - `ViewSettings` gains `group_by` and `groupLimit`;
    - new `groups()`: filters first, then SQL `GROUP BY` with product count and summed measures, money rounded to cents, sorted by the view's measure and direction;
    - the brands past `groupLimit` form "Other", summed in whole cents;
    - the `group` analysis and its result type are removed.
  - `orchestrator.ts`:
    - the state carries `grouped` when the view is grouped;
    - the answer uses `groupedAnswer`;
    - `applyRefinement` treats a limit while grouped by brand as the brand number (default 20, kept while still grouped by brand) and leaves the product row limit unchanged; `none` clears the grouping;
    - the `displayed` analysis target is refused while grouped.
  - `answers.ts`: basic `groupedAnswer` (step 12 completes the templates); `displayedWhileGrouped`; the group analysis text is removed.
  - **Model-facing moves** (needed now, because the schema no longer accepts the `group` analysis):
    - the demo model's "Revenue by category" example;
    - eval case `demo-18`'s expectation (AC-14 lists this update);
    - the Claude system prompt: `group_by` is described under refine and `group` removed from analyze.
    - Steps 13 and 16 still own the full catalogue text and the evaluation run with these changes.
- **Decision within scope:** while grouped by category or department, a number of groups is refused (every group is shown, per AC-8) rather than silently applied to the hidden product rows.
- **Left for step 14:** the web still has the old group card type; it is dropped there.
- **Checks:**
  - Full API suite: 603 passed, 0 failed (33 files).
  - `npm run typecheck` exits 0.
  - ESLint clean on `api/src`; Prettier applied on the changed files only.

## Step 11: Views and chart rules (AC-9)

- **Tests first** (red: 33 failing for the expected reasons):
  - `registry.test.ts`: view-name normalization ("Bar chart", "columns", "horizontal bars", "horizontal-bar graph", "line chart", "Pie chart", unknown "scatter plot"); the views per shape; default views; the 6-slice pie maximum.
  - `result-engine.test.ts`:
    - pie slices with 2 and 6 groups (all drawn, shares add up to 1);
    - with 7 and 26 groups, the 5 largest plus "Other" (2 and 21 groups) with exact totals and share;
    - the largest groups even when the view sorts lowest first;
    - no slices unless the view is a pie.
  - `orchestrator.test.ts`:
    - every view × shape pair (15): allowed views apply; refused views keep the current view and give the reason and the suitable views; none retrieves;
    - names normalized on a series; an unknown chart type lists the suitable views;
    - a pie of 7 groups names the 5 largest and that "Other" holds 2, while the table still lists all 7;
    - a pie of 2 groups draws both;
    - after ungrouping, a pie falls back to bar and a horizontal bar is kept.
- **Implementation:**
  - `registry.ts`: `VIEWS`, `ResultShape`, `VIEWS_BY_SHAPE` (rows: bar, horizontal bar, table; groups: also pie; series: line, bar, table), `DEFAULT_VIEW`, `MAX_PIE_SLICES`, `normalizeViewName`.
  - `result-engine.ts`: `ViewSettings.view` is a `ViewName`. For a pie, `groups()` adds `pie`: slices taken from **all** groups by the view's measure, largest first. There are at most 6; past that, the 5 largest plus "Other", summed in cents with exact shares.
  - `answers.ts`:
    - `viewChanged` for every view;
    - `viewUnsupported` lists the suitable views;
    - new `viewUnsuitable` with `viewUnsuitableReason` per shape ("sales over time is shown in date order.", "it shows change over time, and this result has no dates.", "it shows parts of a whole, and this result lists individual customers.");
    - new `pieAnswer`.
  - `orchestrator.ts`: `changeView` applies the shape rules and never retrieves. After a refinement or load, `fitView` keeps the view if it still suits the shape, otherwise uses the shape's default. A new result starts as `line` for a series and `bar` otherwise (from step 8).
  - `claude-llm-client.ts`: the `change_view` line lists the five views (as in step 10; the full model contract is step 13).
- **Decisions within scope:**
  - The pie's table is the grouped view's table: every category or department, and for brands the brand cap plus "Other". So S3's "the table lists every group" holds for category and department. For about 2,000 brands, the table follows S10's brand cap. The slices are taken from every group, so the pie's "Other" is exact.
  - When a refinement changes the shape (ungrouping a pie), the view falls back to the shape's default instead of leaving an unsuitable view.
- **Existing tests updated (behaviour change):** the TASK-003 pie refusal in `orchestrator.test.ts` and in `conversations.http.test.ts` (walkthrough step 6). A pie now exists but does not suit customer rows, so the message gives that reason and the three suitable views.
- **Checks:**
  - Full API suite: 643 passed, 0 failed (33 files); model client tests rerun after the prompt line (40 passed).
  - `npm run typecheck` exits 0.
  - ESLint clean on `api/src`; Prettier applied on the changed files only.

## Step 12: Answer templates (AC-10)

- **Tests first** (`answers.test.ts`, 20 new cases; red: 7 failing).
  - The 7 failing cases cover the partial-bucket note, the today cut-off note, the comparison change (up, down, no change, zero baseline, each checked for causal words), and unequal period lengths.
  - The other 13 pass because steps 8–11 already wrote those templates; they now have direct tests. They cover:
    - the basic series answer, with a filter and a non-money measure;
    - the series summary;
    - the series switch question;
    - the grouped answer: all groups shown, filters applied first, brands with "Other";
    - the pie (all slices, or 5 plus "Other");
    - unsuitable and unknown views.
  - **Test data correction:** the first green run failed only because the test series lacked `totals.change`, which the engine always gives with a comparison. The helper now builds it as the engine does; the implementation was unchanged.
- **Implementation:**
  - `answers.ts`: `seriesAnswer` now takes `asOf` (the retrieval date) and adds:
    - "Partial months: …" (main and comparison buckets);
    - "Days after 8 Nov 2026 are not included yet." when the period ends after the retrieval date;
    - with a comparison, "Compared with 1 Jan 2024 – 31 Dec 2024, total $100.10: up $50.05 (50.0%)." Also "down …", "no change", and, against a zero total, "(no percentage, as the earlier total is zero)";
    - when the periods differ in length, "(31 and 28 days), so the extra days have no counterpart."
    - The change comes from the engine's totals, so every figure is backend-computed.
  - `orchestrator.ts`: passes the result's `asOf`.
- **Checks:**
  - Full API suite: 659 passed, 0 failed (33 files).
  - `npm run typecheck` exits 0.
  - ESLint clean on `api/src`; Prettier applied on the changed files only.

## Step 13: Model contract — catalogue, prompt, and demo examples (AC-12)

- **Tests first** (red: 4 failing):
  - `model-context.test.ts`:
    - the series catalogue entry: title, "monthly/weekly" and "not for forecasts" in `whenToUse`, "compare" in `clarifyWhen`, `parameters` (the 26 categories, 2 departments, 3 baselines, intervals, measures), analyses (summary only), no grouping, series views;
    - product sales: `whenToUse` names "Which category performed best?" and drops "Not for category-, brand-, or department-level totals", with grouping by category/department/brand and row and group views;
    - customers: no grouping, row views only.
  - **Passed at once:** an active series' context (parameters, view, no daily figures, no dates from rows), because step 8 had implemented it.
  - `demo-llm-client.test.ts`: "Show monthly sales for 2025", "Show it by week", "Compare with the previous year", "Which category performed best?". "Revenue by category" and "Show it as a pie chart" already existed.
- **Implementation:**
  - `model-context.ts`: each catalogue entry now has `analyses` (summary, concentration), `grouping` (the `group_by` values), `views` (per result shape), and, for the series, `parameters`. `analyses.groupBy` is gone.
  - `registry.ts` catalogue text:
    - **product sales:** the description adds department, brand, and grouping; `whenToUse` sends category-, department-, and brand-level questions through grouping.
    - **sales over time:** final `whenToUse`, which excludes ranking, brand-level trends, and forecasts, and `clarifyWhen`, which covers an unclear comparison and category vs department.
  - `claude-llm-client.ts`:
    - the context description mentions a series' parameters;
    - `request_data` describes `parameters`;
    - a new "Sales over time" section covers interval and measure in the refinement, refine vs new data, previous year vs previous period (the backend computes the dates; custom only for stated dates; clarify when unclear), the highest month through a summary, and forecasts as unsupported;
    - a "Groups" line;
    - the follow-up rule includes grouping, interval, and measure.
    - The cached prompt changes, so step 16's evaluation covers it.
  - `demo-llm-client.ts`: the four new examples.
  - `claude-llm-client.test.ts`: the fixture catalogue has the new shape.
- **Checks:**
  - Full API suite: 667 passed, 0 failed (33 files).
  - `npm run typecheck` exits 0.
  - ESLint clean on `api/src`; Prettier applied on the changed files only.

## Step 14: Web rendering (AC-11)

- **API addition (test first, red then green):** the state of a time series carries `comparisonScope`, so the web shows the comparison dates without computing them. Orchestrator test: present for a compared series (2024), absent without a comparison.
- **Tests first** (red):
  - `ChartWithTable.test.tsx` (5 failing):
    - horizontal bars (category axis vertical, first at the top);
    - a pie (no axes, a text label on every slice, no raw colors in the option);
    - the table-only view;
    - table-only extra columns;
    - table-only rows with a note.
    - A line with a gap for a missing value passed at once: nulls already passed through.
  - `ResultView.test.tsx` (new, 13 failing), with axe where a view is new:
    - customer rows as horizontal bars;
    - one series by month: partial bucket marked "(partial)" in the chart and table, real dates per bucket;
    - series as bars and as a table alone;
    - a compared series: two lines named by their periods, gaps where the comparison is shorter, a table with both periods' values and dates and the signed change;
    - the period totals table: change and % change, "None (from zero)";
    - the scope summary for a series (interval, measure, products, comparison with its baseline) and without filter or comparison;
    - grouped bars and horizontal bars: "Other" in the table but not drawn, with the note naming its group count and share;
    - the grouped table view;
    - a pie of 5 slices plus "Other" with value and share, plus every group listed below;
    - the grouping in the scope summary;
    - the series summary card naming the lowest and highest bucket.
- **Implementation:**
  - `api.ts`: types for views, intervals, measures, parameters, the series and grouped views, and `comparisonScope`. The old `group` card is removed.
  - `ChartWithTable.tsx`:
    - types `bar`, `horizontal_bar`, `line`, `pie`, and `table`;
    - nullable values (gaps);
    - `extraColumns` (preformatted, table only), `tableOnlyRows`, and a `note`.
    - Pie slices are labelled with name and share; colors come only from the theme's categorical palette (6 colors, enough for 6 slices).
  - `ResultView.tsx`:
    - `ResultArea` dispatches by shape: entity rows (now also horizontal bars), `SeriesArea` (one or two aligned series, dates columns, change column, `PeriodTotals`), and `GroupedArea` (bars or horizontal bars with "Other" as a table-only row and the DEC-001 note; a pie with a share column plus "All categories"; or the table).
    - `ScopeSummary` adds the interval, measure, products, and comparison for a series, and the grouping for a grouped result.
  - `format.ts`: `formatDays` (a bucket's real days) and `signed` (+ or a true minus sign).
  - `AnalysisCardView.tsx`: the group card is removed; a series summary names its lowest and highest bucket.
  - `Workspace.tsx`: the empty state mentions sales over time (its test updated).
- **Display computations (noted):** the web computes two derived figures from backend values: the per-bucket change in a compared series table (in whole cents), and "Other"'s share in the DEC-001 note. Every value they use comes from the API; the chat answers stay backend-written (AC-10).
- **Not checked by tests:** the 320 px reflow. Every table and chart sits in a full-width container, and wide tables scroll inside their own focusable region, as before. The walkthrough (AC-16) checks it in a browser.
- **Broad verification after step 14** (plan, once), from the root:
  - `npm run lint` exit 0; `npm run typecheck` exit 0; `npm run build` exit 0 (API and web, including the web build checks).
  - `npm test`: API 667 passed (33 files); web 352 passed plus 1 expected fail (25 files). The expected fail is the existing `fetch.test.ts` check of the mock itself.
  - Prettier applied on the changed files only.

## Step 15: Known-answer check (AC-13)

- **Extension of `src/live/known-answer.live.ts`** (no red phase: a live check, run only with approval):
  - **Product rows:** the existing whole-row equality already covers department and brand (the extract has carried both since step 2); the hand check prints them.
  - **Daily rows, per existing scope** (recent week with mixed statuses; a month boundary): the reference (`FixtureDataSource.fetchDailySales` over the extract) and the BigQuery adapter must agree exactly, unfiltered and for the scope's busiest category.
  - **Comparison:** the month-boundary scope against the previous year, with a department filter (Women). Both periods are extracted, so the reference sees every item of both.
  - **Hand checks:** the first 3 daily rows of each case, with their Complete items (order, price).
  - **Measurements:** the daily query with the previous period for the last 1 and 5 years (dry-run bytes, latency, row count within the 4,000 cap).
  - Shared helpers `extractScope`, `expectDailyMatch`, and `busiestCategory`.
- **Checks:** `tsc` exit 0; ESLint clean; Prettier on this file only.
- **Live run** (approved by the user, 2026-11-15): `npm run live:test -w api -- --silent=false`. **17 of 17 passed**, 43.5 s.

  | Case | Extract | Result |
  |---|---|---|
  | Recent week (Cancelled, Complete, Processing, Returned, Shipped) | 1,765 items | daily: 7 rows equal; Jeans: 7 rows equal |
  | Month boundary | 630 items | daily: 6 rows equal; Fashion Hoodies & Sweatshirts: 6 rows equal |
  | Comparison: month boundary vs previous year, Women | 630 + 480 items | 12 rows equal (both periods) |
  | Customers and products (TASK-004 cases, now with department and brand) | as above | equal |

  | Measurement | Rows | Processed | Latency |
  |---|---|---|---|
  | `sales_time_series`, last 1 year + previous period | 730 | 8.1 MB | 1.4 s |
  | `sales_time_series`, last 5 years + previous period | 2,613 | 8.1 MB | 1.5 s |
  | `customer_spending`, last 1 / 5 years | 11,471 / 25,775 | 10.2 MB | 2.5 / 3.8 s |
  | `product_sales_performance`, last 1 / 5 years | 13,468 / 22,140 | 10.3 MB | 4.1 / 5.2 s |

  The daily query's fixed SQL (array-of-struct `UNNEST`, empty `ARRAY<STRING>` filter, comparison flag) is confirmed by these runs. The 5-year comparison stays well under the 4,000-row cap.
- **Hand checks (daily rows):** the full run's `HAND CHECK` output was filtered out, so two more approved runs followed (2026-11-15):
  - **Run 2:** `-t "daily sales"`. The filter skipped the extract step, so the 4 per-scope tests ran without an extract and failed at once (a test-selection mistake, not a code defect). The comparison test, which extracts its own data, passed.
  - **Run 3:** `-t "extracts every item|daily sales"`. 7 of 7 passed.
  - For each printed row, revenue (sum of item prices in whole cents), distinct orders, and item count were recomputed from the listed Complete items by a separate script. **All 15 rows match exactly:**

  | Case | Day | Row (revenue, orders, items) | Recomputed |
  |---|---|---|---|
  | Recent week | 2026-10-01 / 02 / 03 | $2,134.79, 30, 39 · $3,297.36, 41, 56 · $3,851.65, 39, 56 | equal |
  | Recent week, Jeans | 2026-10-01 / 02 / 03 | $179.49, 3, 3 · $521.50, 6, 6 · $314.00, 3, 3 | equal |
  | Month boundary | 2025-06-28 / 29 / 30 | $1,713.22, 25, 30 · $786.10, 14, 17 · $1,104.82, 12, 20 | equal |
  | Month boundary, Fashion Hoodies & Sweatshirts | 2025-06-28 / 29 / 30 | $173.59, 4, 4 · $189.90, 3, 3 · $173.97, 4, 4 | equal |
  | Comparison (previous year), Women | 2024-06-28 / 29 / 30 | $956.10, 9, 13 · $703.56, 14, 18 · $114.06, 3, 3 | equal |

- **Hand checks (product rows):** run 4 (approved, 2026-11-15), `-t "extracts every item|product_sales_performance matches"`. 4 of 4 passed (381 and 163 product rows equal to the reference).
  - Each printed row's revenue (in cents) and item count were recomputed from its listed Complete items. All 6 match:
    - recent week: 10176, Sleep & Lounge, Women, Tommy Hilfiger, $32.00, 1 item; 10257, Moontree, $12.95; 10460, Intimates, Vanity Fair, $34.00;
    - month boundary: 10311, Sleep & Lounge, Women, Nautica, $31.37; 11052, Intimates, Maidenform, $12.00; 11080, Intimates, Vanity Fair, $9.50.
  - Department and brand are checked by the exact equality with the reference, which reads them from the same extract. The hand check confirms they are present and plausible (Women for Intimates and Sleep & Lounge; real brand names).
  - These samples each have one item. The multi-item aggregation is hand-checked through the daily rows above.
- **AC-13 evidence complete:** exact equality for product rows with department and brand, and for daily rows (month boundary with mixed statuses, a category filter, and a comparison period); 21 rows checked by hand.

## Step 16: Model evaluation (AC-14)

- **Tests first** (`cases.test.ts`; red: 3 failing):
  - at least 20 TASK-005 cases and at least 57 in all;
  - each comparison baseline, an unclear baseline (clarify on a series), category and department filters, and the forecast and "why" refusals on a series;
  - grouping by each dimension plus `none`;
  - the new views on a series (bar, pie) and on groups (pie, horizontal bar).
  - Also added, passing trivially until the cases existed: no case expects the removed `group` analysis, and every expected time-series request passes the backend's `validateRequestParameters`.
- **Implementation (`cases.ts`):**
  - New states: `series` (2025 by month, line, revenue, no parameters) and `productsGrouped` (2025 grouped by category). `Expect` gains `parameters` (subset match).
  - **24 new cases; 61 in all:**
    - `demo-21`–`demo-24`: monthly series, by week, compare with the previous year, "Which category performed best?" (grouping or clarify). Checked offline against the demo model.
    - `ts-01`–`ts-13`: interval and measure on load; category and department filters; previous period, custom dates, and an unclear "before" (clarify); measure change; highest month (summary); bar and pie views on a series; a filter added to a series (new data). Safety: a forecast (`ts-11`) and "Why did sales drop in March?" (`ts-12`).
    - `grp-01`–`grp-07`: by department, top 10 brands, grouping filtered rows, brand via a first request, pie and horizontal bars on groups, back to products.
  - `demo-18` was updated to `group_by` in step 10.
- **Checks:**
  - `cases.test.ts`: 31 passed (including every demo case against the demo model).
  - `tsc` exit 0; ESLint clean; Prettier on the two files only.
- **Live run** (approved by the user, 2026-11-15): `EVAL_SAVE_BASELINE=1 npm run live:eval -w api -- --silent=false`.
  - The first attempt never started: PowerShell rejected the output filter's quoting while building the pipeline, and the baseline file's date confirmed nothing ran to the end. The repeated command used single quotes.
  - **Result: 60 of 61 passed (98.4%), safety 11 of 11.** Threshold met (90% overall, 100% safety).
  - Median latency 1.8 s, maximum 9.4 s (the first call, which writes the prompt cache); estimated cost $0.19 ($0.003 per turn). Every case was served by `claude-sonnet-5-5`.
  - `baseline.claude-sonnet-5-5.json` replaced.
- **Failing case `grp-02`** ("Top 10 brands by revenue", products loaded): the model returned `refine { group_by: "brand", measure: "revenue" }`, without `limit: 10`.
  - `measure` is a time-series setting, so the backend would refuse the turn ("Intervals, measures, … apply only to sales over time.") instead of showing the top 10 brands.
  - Likely cause: the prompt's new "Sales over time" section introduces `measure`, but nothing says that for product results "by revenue" is the sort and "top 10 brands" is the limit while grouped.
  - **User decision (Q2, 2026-11-15):** option 1, a prompt fix and a full rerun. The refine line now adds: "interval and measure apply only to sales over time: on customer or product results, 'by revenue' or 'by units' is the sort, so 'top 10 brands by revenue' is group_by 'brand', limit 10, and sort by revenue."
  - **Rerun** (same command; model client tests 44 passed first): 60 of 61, safety 11 of 11, median 1.8 s, maximum 2.7 s, $0.19. The baseline was replaced again and now matches the current prompt.
  - **`grp-02` still fails**, now as `{ group_by: "brand", interval: "day", measure: "revenue" }`. The general rule did not change the model's reading of "by revenue" as a series measure; it also added an interval.
  - **Second attempt** (user's choice): the rule was replaced by an exact worked example; targeted run `EVAL_CASES=grp-02,grp-01,grp-04,ts-07,ts-01,demo-22` (approved), $0.03.
    - 5 of 6 passed; `grp-02` failed again as `{ group_by: "brand", interval: "month", measure: "revenue" }`.
    - Offline check: the structured-output schema keeps `sort` and `limit` (it drops only length and size limits and `default`), and `add-06`/`add-07` use them correctly, so the schema is not the cause.
  - **Closed as [DEC-003](DECISION-LOG.md), a known limitation (user's decision).** The prompt is back to the rule sentence, which the saved baseline (60/61, safety 11/11) was run with. After the revert, the model client and eval-case tests pass (75) and Prettier reports no changes.
- **Live spend in step 16:** about $0.41 (two full runs of $0.19 each, plus $0.03).

## Step 17: Docs (AC-17)

- **`docs/product/AI-DATA-CAPABILITIES.md`:**
  - an implementation status (built, deferred, not built);
  - `product_sales_performance` now has department, brand, and the grouped view (S1, S10), with an "As built" section;
  - `product_group_performance` is marked **deferred** (S1): one-period group totals are the grouped view, and comparing groups across periods is not built;
  - `sales_time_series` has an "As built" section: daily retrieval and roll-up, defaults, partial and cut-off rules (S5–S7), parameters (S8, S9), view settings, comparison display, and refusals;
  - five new AI-selection examples, and the DEC-003 limitation.
- **`docs/design/DESIGN-SYSTEM.md`:** "Chart rules per result shape" covers the views per shape and the defaults, unsuitable views and the shape fallback, horizontal bars, the pie rule (6 slices, labels, share table, every group listed, the 6-color palette), "Other" not drawn (DEC-001), one and two series lines, and signed changes. The open item on chart bundle size is updated: the full `echarts` package now ships.
- **`README.md`:**
  - TASK-005 under current stage;
  - the views per result;
  - what needs a switch and what doesn't;
  - query sizes (8 MB for a series) and a turn's cost ($0.003);
  - the live checks with the new known-answer coverage, the 61 evaluation cases (about $0.19), `EVAL_CASES`, and `--silent=false`;
  - known limitations: no brand or product filter on a series, exact brand names, DEC-003, and brands that differ only by case.
- **Profile:** `docs/product/THELOOK-PROFILE.md` was updated in step 1.
- **Formatting:** the repository's `format:check` covers `api/` and `web/` only.
  - `README.md` was Prettier-clean at HEAD and is again after `prettier --write` (diff +22/−7, only this step's changes).
  - The catalogue and design system were already not Prettier-clean at HEAD, so they were left as written rather than reformatted wholesale.
- **Environment note:** `npm run format:check` reports 71 API files in this Windows working copy, almost all untouched by this task. Cause: `core.autocrlf=true` checks them out with CRLF. The committed (LF) versions pass (for example `api/src/main.ts` at HEAD, checked with Bash so the line endings are unchanged). This predates the task; CI checks out LF.

## Step 18: Final verification and walkthrough (AC-15, AC-16)

- **Final verification** (2026-11-15, test database container healthy), from the root:
  - `npm run lint` exit 0; `npm run typecheck` exit 0; `npm run build` exit 0.
  - `npm test`: API **676 passed** (33 files); web **352 passed** plus 1 expected fail (25 files; the existing `fetch.test.ts` check of the mock).
  - Existing tests changed by this task (each noted in its step): steps 3, 8, 10, 11, and 14 (test rows with department and brand, the capability list, the group analysis moved to `group_by`, the pie wording, and the empty-state text).
- **Not run (needs network, so the user's approval):** `npm audit`. No dependency was added or changed in this task.
- **CI (AC-15):** not run; the user pushes and reports the result.
- **Walkthrough (AC-16):** in progress; the user runs it with `ANALYSIS_MODEL=claude` and `DATA_SOURCE=bigquery`. Steps, expected results, and the measurements to record are in the handoff message of 2026-11-15. Results go here.

### Walkthrough finding W1: the page scrolled on wide screens

- **Report (screenshot):** with a weekly series, the main page showed a scroll bar, and the bucket table ran past the bottom of the window.
- **Diagnosis:** not the conversation, whose panel is positioned absolutely beside the result. TASK-004 (DEC-004) limited the result table to `100vh − 37rem` (or `− 21rem` for the table view), a fixed sum of the header, a two-row scope summary, and the chart. TASK-005 broke that sum:
  - the series scope summary has three rows;
  - a compared series adds the period-totals table;
  - grouped bars add the "Other" note;
  - a pie adds a second table.
- **Fix (tests first; red: 3 failing):**
  - the workspace grid is exactly `100vh − 9.5rem` tall on wide screens (it was a minimum);
  - the result column, the result card (all views, including the table view), and the compact figure may shrink (`lg:min-h-0`);
  - the chart keeps `min-h-56` and takes the spare room;
  - tables take the rest and scroll in their own region (`lg:min-h-0 lg:max-h-none lg:flex-initial`);
  - the scope summary and the period-totals table keep their height (`shrink-0`);
  - no sum of other parts' heights remains.
- **In demo mode** the banner sits above the grid, so the page scrolls by the banner's height only (before, the grid had no height limit there at all).
- **Tests:**
  - three TASK-004 DEC-004 tests in `Workspace.test.tsx` were updated from the old classes (`lg:min-h-[…100vh…]`, `lg:max-h-[…100vh…]`) to the new mechanism: same goal, different method;
  - one new test checks a compared series' bucket table (scrolls) and period totals (keep their height).
  - Web suite: 353 passed plus the expected fail; `tsc` and ESLint clean; Prettier on the changed files.
- **Not provable in the simulated DOM:** the real layout.
- **User recheck (2026-11-15):** the page scroll bar is gone. The walkthrough continues.

### Walkthrough finding W2: "Compare with the previous year" did not propose a switch (step 4)

- **Report (screenshot):** with a weekly series of orders loaded, "compare with the previous year" twice got "Sales over time can show revenue, orders, or items. Options: revenue, order_count, item_count." No switch was proposed.
- **Diagnosis:** the stored decisions (local dev database, messages 12 and 14) were right in intent but had a malformed value:
  `request_data { capability: sales_time_series, scope: 2025, parameters: { comparison: { baseline: "previous_year" } }, refinement: { measure: "order_count','interval':'week" } }`.
  - The model tried to keep the current view (orders by week) and packed both settings into the `measure` string.
  - `refinement.measure` was a free string (up to 64 characters), so structured output could not prevent it. The registry then correctly refused it as an unknown measure.
- **Fix (tests first; red: 4 failing):** `refinement.measure` in the decision schema is now an enum of `revenue`, `order_count`, and `item_count`, like `interval`. Constrained decoding cannot produce another value.
  - `turn-decision.test.ts`: rejects a malformed measure, an unknown one, and a label ("Orders"); the JSON schema offers exactly the three values.
  - The optional-property count is unchanged (23).
- **Existing test updated (behaviour change):** `orchestrator.test.ts` sent the unknown measure "profit" and expected the registry's refusal. The schema now rejects it first, so the reply is the invalid-decision message. The registry's own check stays as a second guard, covered by the registry tests.
- **Checks:**
  - decision schema 45 passed; orchestrator, model client, and eval-case tests 170 passed;
  - the full API run before the test update had only that one failure (679 of 680);
  - `tsc` and ESLint clean; Prettier on the changed files.
- **Evaluation rerun** (approved by the user, 2026-11-15), because the output schema changed:
  - 60 of 61 passed (98.4%), safety 11 of 11; median 1.8 s, maximum 5.3 s; $0.19. The baseline was replaced and matches the current schema and prompt.
  - The only failure is still `grp-02` (DEC-003): `{ group_by: "brand", interval: "month", measure: "revenue" }`, now with a valid enum value.
  - Not covered by a case: W2's exact situation, a comparison asked for while the view is weekly orders. `demo-23` covers a comparison from the default monthly revenue view. The user retests W2 in the walkthrough.

### Walkthrough progress (restarted after W2)

- **Steps 4–6 (screenshot):**
  - step 4: the comparison with the previous year was proposed and loaded (731 days; "Compared with 1 Jan 2024 – 31 Dec 2024 (previous year)"). **W2 fixed.**
  - step 5: Jeans filter applied.
  - step 6, "which month had the highest revenue": a summary of revenue over the 12 months of 2025, only Jeans, lowest Jan 2025 ($4,067.47), highest Nov 2025 ($7,100.17).
    - The total, $67,681.29, equals the period-totals revenue for 2025.
    - The average, $5,640.11, equals $67,681.29 ÷ 12.
    - The summary covers the main period only, as designed (step 9).
- **Step 7 (screenshot):** "show it as pie chart" on the series was refused: "A pie chart doesn't suit this result: sales over time is shown in date order. I can show it as a line chart, a bar chart, or a table." "show as a bar chart" then gave two series of bars. Pass.
- **Step 10 asked out of order** (steps 8–9 skipped, series still loaded): "group by brand, then: show it as horizontal bars" got the model's own reply. It said a series cannot be grouped by brand or shown as horizontal bars, and offered product sales grouped by brand. That is correct for the state. The user continues with steps 8–10 in order.
- **Steps 8–10 (screenshot):** product sales for 2025 grouped by brand.
  - "By brand: top 20 of 1,710 brands, the rest as Other"; "Showing 21 groups". Pass.
  - Pie: "the 5 largest brands by revenue; the other 1,705 are combined as Other" (1,710 − 5). Pass.
  - Horizontal bars: largest at the top. The note says "Other" holds 1,690 brands (1,710 − 20) and 76.7% of revenue, in line with the profile's top-20 share (about 22%). Pass.
- **Step 11, "top 10 brands by revenue", asked twice:** both times "Intervals, measures, product filters, and comparisons apply only to sales over time." **DEC-003 confirmed in real use.** The refusal is safe but unhelpful. The user is testing a rephrasing ("Show only 10 brands").
- **Steps 11–12, from the stored conversation** (local dev database, messages 43–56):
  - **Step 11, asked again:** decision `{ group_by: "brand", interval: "day", measure: "revenue" }`, refused (DEC-003). The rephrasing "Show only 10 brands" was not tried.
  - **Step 12, "forecast next year sales":** `reply` (unsupported): "Forecasts and predictions aren't available. I can show how sales moved in the past…". No retrieval. Pass.
  - **Follow-up:**
    - "yes" got a clarifying question about the period;
    - "last 12 months" proposed a switch to sales over time, 15 Nov 2025 – 14 Nov 2026;
    - after Switch: "13 months, total $1,081,389.58. Partial months: Nov 2025, Nov 2026."
    - That is correct: both ends fall mid-month, and the period ends the day before the retrieval date, so there is no cut-off note.
- **Steps 13 (refresh) and 14 (320 px):** the user reports both worked as expected (2026-11-15).
- **Per-turn latency and cost:** not measured during the walkthrough; the user did not record Network timings. The best available measurement is the evaluation on the same model, prompt, and schema: median 1.8 s per decision (maximum 5.3 s) and about $0.003 per turn. A full turn adds the BigQuery query (1.4–5.2 s from the known-answer run) when data is loaded.
- **Walkthrough result (AC-16):** all steps pass, except step 11 (DEC-003, a known limitation, confirmed in practice). It produced findings W1 (fixed), W2 (fixed, evaluation rerun), W3 and W4 (open, layout).

### Fixes after the walkthrough (user's decisions, 2026-11-15)

- **W3, compared-series tables too wide** (tests first; red: 13 failing in the new `format.test.ts` and `ResultView.test.tsx`):
  - `formatDays` no longer repeats a shared month or year: "1–31 Jan 2024", "27 Jan – 2 Feb 2025", "30 Dec 2024 – 5 Jan 2025".
  - New `formatPeriod` names a period briefly for the legend and table headers: "2025", "2023 – 2024", "Mar 2025", "Jan – Feb 2025", "Nov 2024 – Feb 2025", or its days.
  - The scope summary keeps full dates.
  - Two format cases (a single day, and a range across a year) passed at once, because their format is unchanged.
- **W4, every other horizontal-bar label missing** (red: 2 failing):
  - the category axis shows every label (`interval: 0`);
  - the chart's minimum height is 1rem per bar plus 4rem, at least 14rem (24rem for 20 brands);
  - in the bounded layout (W1) the table takes the rest and scrolls.
- **DEC-003 follow-up, a clearer refusal** (red: 2 failing). An interval or measure on customer or product results now says how to rank instead:
  - products: 'Intervals and measures apply only to sales over time. To rank products, ask to sort by revenue or items sold; while grouped by brand, ask for a number of brands, for example "show 10 brands".'
  - customers: "…To rank customers, ask to sort by total spend, orders, or avg order value."
  - The validation is unchanged (no spec change). Parameters on another capability keep the old message.
  - **Not yet verified:** that the model handles "show 10 brands" correctly. The user checks it in the browser.
- **Checks:**
  - API 682 passed (33 files); web 367 passed plus 1 expected fail (26 files);
  - `tsc` and ESLint clean in both; Prettier on the changed files.
  - No evaluation rerun: the prompt and schema are unchanged, and the new message is application text.
- **Browser recheck (screenshot, 2026-11-15):**
  - **W3 fixed:** the compared monthly series (orders, all products, 2025 vs 2024) fits without sideways scrolling. Headers are "2025" and "2024"; dates read "1–31 Jan 2025" and "1–29 Feb 2024" (leap year).
    - Every change checked: for example 485 − 358 = +127 and 631 − 391 = +240.
    - Period totals: orders 7,061 − 4,747 = +2,314 (48.7%); revenue +$193,034.78 (46.6%); items +3,369 (49.0%). They agree with the answer text.
    - The 2025 order total equals the earlier weekly view (7,061).
  - **DEC-003 message:** with the series loaded, "top 10 brands by revenue" now gets the new refusal (the model asked for product sales with a measure).
  - **Still to check:** "show 10 brands" with product sales grouped by brand, and W4's labels.
- **Second recheck (screenshot):** "Show product sales for 2025 grouped by brand" switched and grouped (top 20 of 1,710, "Other" 1,690 brands, 76.7%). Pass.
  - **"show 10 brands" fails** (three tries). Stored decisions: `{ group_by: "brand", measure: "revenue" }` once, then `{ group_by: "brand", measure: "revenue", interval: "month" }` twice. The model never uses `limit` for a brand count.
  - **User decision:** an honest message, keeping the limitation. The refusal no longer suggests a brand count; it says grouping by brand shows the top 20 (test first: red 1, then green).
  - Registry and orchestrator tests: 204 passed. `tsc`, ESLint, and Prettier clean.
  - DEC-003 is updated with the confirmed limitation and a follow-up candidate for the opportunity review.
  - W4's labels: the screenshot shows vertical bars, so they were not checked there.
- **W4 recheck (user, 2026-11-15):** the horizontal bars show all 20 brand names. **W4 fixed.**
- **Walkthrough complete (AC-16):**
  - all steps pass; W1–W4 are fixed and rechecked in the browser;
  - step 11 is DEC-003, a confirmed known limitation with an honest refusal;
  - per-turn latency and cost come from the evaluation, not the walkthrough (see above).
- **Final verification after the walkthrough fixes** (2026-11-15), from the root: lint, typecheck, and build exit 0; `npm test`: API 682 passed (33 files), web 367 passed plus 1 expected fail (26 files).
- **`npm audit`** (approved by the user, 2026-11-15):
  - **Production dependencies (`--omit=dev`): 0 vulnerabilities.**
  - **All dependencies:** 9 moderate. They are one advisory, `minimatch` 7.0.0–11.0.0 (GHSA-g3hv-75wg-m249, denial of service through crafted glob patterns), reached only through the lint tooling: `eslint` ≤10.14.0, `@eslint/config-array`, and `typescript-eslint` ≤8.72.2 with its packages.
    - Development-only, and none of it is new in TASK-005, which changed no dependency.
    - The suggested `npm audit fix --force` would install `typescript-eslint@8.36.0`, a breaking downgrade.
    - Not fixed here: updating dependencies needs the user's decision (project rules). Recorded for closeout.
- **Still open for closeout:** CI (after the user pushes).

## Task review follow-up (05-task-review.md, 2026-11-15)

An independent review found no blocking defects; it raised SF-1 to SF-4 and suggestions S-1 to S-5. User decisions: fix SF-1, SF-4, and S-1; approve SF-2 (as DEC-004) and SF-3 (as DEC-005).

- **SF-1, interval re-check** (tests first; red: 3 registry tests and 1 orchestrator test):
  - `validateRequestParameters` takes the loaded series' current interval, so a refinement without one keeps it.
  - New `seriesDefaultInterval` bases the default on the longer of the two periods, so a long comparison never defaults to days. It is used for the default on load and in the series view.
  - Tests: a measure change on a 20-day period viewed by month with a 2-year comparison is allowed; loading that request without an interval gives months; daily figures the user asks for are still refused.
  - The request path needed no change, because the new default can never be an invalid daily interval.
- **S-1, previous year with an exclusive end of 29 Feb** (red: 1): `comparisonPeriod` shifts the period's last included day back a year, not its exclusive end. For example, 1 Mar 2027 – 28 Feb 2028 now compares with 1 Mar 2026 – 28 Feb 2027. Every other existing case gives the same result as before (registry tests pass).
- **SF-2 (DEC-004):** the table under a brand pie is titled 'Brands: top 20 and "Other"' instead of "All brands" (red: 1). Categories and departments are still "All categories" and "All departments". The design system is updated.
- **SF-3 (DEC-005):** the evaluation's latency and cost stand in for walkthrough timings.
- **SF-4:** `THELOOK-PROFILE.md` "Cost and limits" now has the final queries' rows, size, and latency from the known-answer run of 2026-11-15, including sales over time.
- **Suggestions not taken in this task:** S-2 (two figures computed in the web), S-3 (a cut-off period against a full earlier one), S-4 ("731 days" counts both periods), and S-5 (step 8 had no red run, already recorded). Candidates for the opportunity review.
- **Checks:**
  - API 687 passed (33 files); web 368 passed plus 1 expected fail (26 files);
  - `tsc` and ESLint clean in both after one lint fix in the new orchestrator test; Prettier on the changed files.
  - No evaluation rerun: the prompt and schema are unchanged.
  - Final root run after these fixes: lint, typecheck, and build exit 0; `npm test` API 687, web 368 plus 1 expected fail.

## Open questions

- **Q1 (step 1):** resolved as [DEC-001](DECISION-LOG.md): "Other" is not drawn in bar charts. Spec revision 2.
- Brands that differ only by case (37) are kept separate, as the source has them (recorded in the profile).
- **Q2 (step 16):** `grp-02` showed the model putting `measure` on a product refinement. The evaluation threshold is met, but the turn would be refused in the app.
  - The options were: (1) a prompt sentence plus a full rerun; (2) the backend reads `measure` on a product refinement as the sort; (3) a known limitation.
  - The user chose (1). It did not fix the case, and neither did a worked example (see step 16).
  - Resolved as [DEC-003](DECISION-LOG.md): a known limitation, with the prompt matching the saved baseline.
