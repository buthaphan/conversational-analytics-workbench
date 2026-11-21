# AI Data Capability Catalogue

## Purpose

This document defines the data capabilities available to the conversational analytics assistant. It is a product and implementation handoff for Claude; it is not permission to connect to a live cloud project or run deployment commands.

The showcase uses Google's synthetic TheLook ecommerce data. It is intended to demonstrate how an AI assistant can select a suitable, approved data capability, clarify missing details, and present verified results. Do not describe the synthetic data as real customer or business data.

The assistant must choose among these broad capabilities. Do not create one stored procedure for every wording, ranking, chart type, or date range. Each capability should accept validated parameters for scope and measures. The database or trusted backend performs exact filtering, aggregation, and ranking; the model interprets user intent and presents the returned results.

## Shared interaction and session rules

### Terms

- **Authentication session:** the signed-in user's server-side login session.
- **Analysis session:** the user's current one-page analytics interaction, tied to the active authentication session. It is separate from any future saved/reopenable analysis feature.
- **Active result set:** the complete, bounded, structured result for the current capability and scope. It is stored server-side and is not the same as the rows currently visible in a chart or table.

### Rules

1. Each user has at most one authentication session (signing in elsewhere ends the previous one), and therefore one active analysis session and one active result set.
2. Store the analysis session, questions, result-set metadata, and result data in PostgreSQL, scoped to the user and authentication-session identifier. Do not rely on browser memory or model chat history as the source of truth.
3. Preserve the analysis session and active result set through a page refresh while authentication remains valid.
4. When the authentication session ends (logout, closing the app without signing out, inactivity expiry, or replacement by a new sign-in), delete the associated analysis session, questions, and result data. A later login starts with an empty analysis session. Saving or restoring prior sessions is future functionality.
5. Record the active capability, date range, filters, grouping, available measures, creation time, and result-set ID. Give the user a visible summary of the active scope.
6. First check whether the active result set contains enough data to answer a follow-up. Reuse it when possible. A chart change, sort order, or ranking direction alone does not require data retrieval.
7. Retain all rows needed to answer supported follow-up questions within the declared scope, not only the rows currently displayed. The maximum size and overflow behavior must be set after profiling. Never silently truncate a result; if the safe limit would be exceeded, explain the limitation and require a narrower scope or another approved server-side approach.
8. If a question needs a different capability or scope, do not silently replace the active result set. Tell the user what the current result set covers, what new data is needed, and ask whether they want to continue with the current result set or load the new one.
9. On confirmation, retrieve the new bounded result and replace the active result set. Only the active result set is guaranteed in this version; the replaced result is not saved for later.
10. Ask a focused clarification when a required term, measure, period, or threshold has multiple reasonable meanings. Do not guess silently.
11. Never generate or execute arbitrary SQL from model output. Map the request to a documented capability and validated parameters. Enforce limits and permissions in application code and the data layer.
12. Send the model only the scope metadata and result rows needed to answer. Do not place a complete raw transaction table in model context. Avoid returning emails or other unnecessary personal fields.
13. Treat chart choice as presentation over an existing result set. If the user requests an unsuitable chart, explain briefly and offer a legible alternative or a supported subset.
## Capability contracts

Each description below is written for the AI's capability catalogue. The operation name is an implementation identifier; selection must be based on the purpose, definitions, inputs, and outputs rather than keyword matching alone.

**Implementation status:**
- **Built:** `customer_spending` (TASK-003/004), `product_sales_performance` with its grouped view, and `sales_time_series` (TASK-005).
- **Deferred:** `product_group_performance`. Its one-period questions are answered by the grouped view of `product_sales_performance` (TASK-005 decision S1).
- **Not built yet:** the other capabilities.
- The text the model receives is the registry's catalogue (`api/src/analysis/capabilities/registry.ts`), kept in line with the sections below.

### 1. Customer spending analysis — `customer_spending`

**AI description:** Use this capability when the user wants to compare customers by the monetary value of completed purchases. For the requested scope, return a customer-level summary with customer ID, display name, total spend, distinct completed-order count, and average spend per completed order. Support validated date bounds, optional spend/order filters, measure selection, sort direction, and result limit. Use the full customer-level result for follow-up ranking questions within the loaded scope. Do not use this capability when the user is asking only about purchase frequency, recency, or a specific order's line items.

**Example requests:** “Who spent the most last year?”, “Show the lowest spenders,” “Who spent over $500?”, “Who had the highest average order value?”

**Clarify when needed:** What “best customer” means; whether “last year” means the previous calendar year or trailing 12 months; currency assumptions if not supplied by the data.

### 2. Customer purchase frequency and recency — `customer_purchase_activity`

**AI description:** Use this capability when the user asks how often or how recently a customer purchased. Return customer ID, display name, distinct completed-order count for the selected period, last completed purchase date, and days since that purchase relative to a supplied as-of date. Support date scope, minimum/maximum order-count thresholds, inactivity threshold, sorting, and result limit. Do not rank customers by money spent unless that measure is explicitly requested; use `customer_spending` for that.

**Example requests:** “Who ordered more than twice?”, “Which customers have not bought in 90 days?”, “Who are our most frequent customers?”

**Clarify when needed:** Whether “more than two times” means at least three completed orders; what date to calculate inactivity from; whether the user means orders or individual items.

### 3. Customer, order, and item details — `order_detail_lookup`

**AI description:** Use this capability to inspect the purchases behind an aggregate or to answer a lookup about a specific customer, order, or product item. Return bounded line-level details such as order ID, customer ID, product ID/name, purchase date, item status, and sale price. Accept validated customer/order/product/date/status filters and a strict row limit. Do not use it to rank or aggregate all customers or products; use the relevant summary capability for that.

**Example requests:** “What did this customer buy in March?”, “Show the orders behind this customer's total,” “What items were in order 123?”

**Clarify when needed:** Which customer or order if not identified; whether they want item details or a summary.

### 4. Product sales performance — `product_sales_performance`

**AI description:** Use this capability to compare individual products by sales results. Return product ID/name, category, department, brand, revenue, and item count for the selected scope. Allow the user to choose revenue or item count as the ranking measure, plus date bounds, product filters, sort direction, and result limit. In this dataset, each completed `order_items` row represents an item; count rows for item count. The same result can be shown **grouped by category, department, or brand** for one period (a view, so no new retrieval): use that for “which category performed best?”. Not for sales over time.

**Example requests:** “Which products earned the most revenue?”, “Which products sold the most units?”, “Show the lowest-selling products this quarter,” “Which category performed best?”, “Show revenue by department.”

**Clarify when needed:** Whether “top-selling” means revenue or units when context does not resolve it.

**As built (TASK-005):**
- **Grouped view** (`refinement.group_by`):
  - row filters apply first; each group has its product count, revenue, and items, sorted by the view's measure;
  - all categories and departments are shown; for brands, the top 20, or 1–30 on request, plus one exact “Other (*n* brands)” row;
  - `none` returns to product rows; customers cannot be grouped;
  - analyses still run on product rows.
- **Brand values** (about 2,000 per year) are never sent to the model, only their count. A brand filter must use the exact name and is checked against the stored result.
- **Views:** bar, horizontal bar, and table for products; also pie when grouped.

### 5. Category, department, and brand performance — `product_group_performance`

**AI description:** Use this capability when the user wants results grouped by product category, department, or brand rather than by individual product. Return group-level revenue and item count for one or more validated periods, with optional filters and comparison/change measures. Do not use it when the user asks about named individual products or a trend across time buckets.

**Example requests:** “Which category performed best?”, “Compare brands by revenue,” “Which department grew most between these periods?”

**Clarify when needed:** Which grouping dimension or measure the user means if not evident.

**Status: deferred (TASK-005 S1).** One-period group totals are the grouped view of `product_sales_performance`. Comparing groups across two periods (“which department grew most?”) is not built yet.

### 6. Sales time series — `sales_time_series`

**AI description:** Use this capability when the user asks how sales changed over time. Return revenue, distinct order count, and item count grouped into a validated day, week, or month interval. Support date bounds and optional product/category/brand filters, and optional comparison with a second period. Do not use it for individual-customer rankings unless a customer breakdown is explicitly requested and permitted.

**Example requests:** “Show monthly sales for the last year,” “Did sales rise compared with the previous period?”, “Show weekly revenue for this product.”

**Clarify when needed:** Date range, interval, and comparison baseline when they cannot be inferred from the request or conversation.

**As built (TASK-005):**
- **Retrieval:**
  - daily rows (one per UTC day with completed sales), rolled up to day, week (ISO, Monday to Sunday), or month in PostgreSQL;
  - default interval: days up to 31 days, weeks up to 92 days, otherwise months; daily buckets up to 366 days;
  - days without sales count as zero; days after today are left out and the answer says so;
  - first and last buckets not fully inside the period, and the bucket containing today, are marked partial.
- **Parameters** (changing one needs new data and a confirmed switch):
  - a product filter by category or department (1–10 values). Brand and single-product filters are deferred, because brand names cannot be checked before retrieval.
  - a comparison: `previous_period` (the same number of calendar months before when the period is whole months, otherwise the same number of days), `previous_year` (29 Feb becomes 28 Feb), or `custom` dates. The backend computes the first two.
- **View settings** (no new data): interval, measure (revenue, orders, or items), and view (line, bar, or table).
- **Comparison display:** two lines aligned by bucket position, both periods' dates in the table, and period totals with the change and % change (none from a zero total).
- **Refused with an alternative:** sorting, row limits, value filters, grouping, concentration, and pie or horizontal-bar views. The summary analysis names the lowest and highest bucket. Forecasts and causal “why” questions are refused.

### 7. Customer segment analysis — `customer_segment_analysis`

**AI description:** Use this capability to compare customer groups using attributes present in the dataset, such as country, age group, gender, or acquisition traffic source. Return group size and requested aggregate measures such as spend, order count, or average spend for a defined period. Support validated group dimensions, measures, filters, and date bounds. Return groups, not individual customer records. Do not infer causal explanations from observed differences.

**Example requests:** “Which countries have the highest average spend?”, “Compare purchase behaviour by traffic source,” “Which age groups place the most orders?”

**Clarify when needed:** Which measure is intended by “best” or “most valuable.” Do not expose very small groups if a minimum group-size rule is configured.

### 8. Order fulfilment — `order_fulfilment`

**AI description:** Use this capability for order status, shipping, delivery, and elapsed fulfilment time questions. Return bounded order/item records or aggregates using available status and created/shipped/delivered timestamps. Support date, status, customer, product, and result-limit parameters. Only calculate a duration when both required timestamps exist. Do not interpret an absence of recent purchases as a delivery delay.

**Example requests:** “How long do orders take to arrive?”, “Which orders have not been delivered?”, “Compare delivery times this quarter and last quarter.”

**Clarify when needed:** Whether the user means order-level or item-level status and which date period to inspect.

### 9. Returns and cancellations — `returns_and_cancellations`

**AI description:** Use this capability for returned or cancelled items/orders, their counts, rates, and associated sales amounts. Group results by a requested period or product dimension. Return the numerator and denominator used for every rate, and apply the verified source status and return-date definitions. Do not describe returned purchases as payment defaults or infer why a return occurred.

**Example requests:** “Which products have the most returns?”, “What share of orders were cancelled?”, “Did returns increase this quarter?”

**Clarify when needed:** Whether the user means returned items or orders containing a return; how to define the rate if more than one denominator is reasonable.

### 10. Products bought together — `basket_affinity`

**AI description:** Use this capability to find products that occur together in the same completed order. Return product pairs, distinct order count, and optionally the share of orders containing either product that also contain the pair. Support date bounds, an optional product anchor, and result limit. This measures co-occurrence only; do not claim causation or that one product makes customers buy another.

**Example requests:** “Which products are often bought in the same order?”, “What is commonly bought with this product?”

**Clarify when needed:** Whether the user wants pairs for a specific product or the most common pairs overall, and the date scope.

## Shared parameter and output expectations

The implementation should define typed, validated inputs for each capability, as applicable:

- `start_date` inclusive and `end_date` exclusive;
- explicit period semantics for phrases such as “last year”;
- supported measure and grouping dimensions;
- thresholds and filter values;
- sort measure and direction;
- bounded `limit`, which selects how many rows are displayed or ranked from the stored active result set. It does not restrict what is retrieved: retrieval keeps every row in the declared scope (rule 7), so a follow-up such as reversing the sort can be answered without a new fetch. Line-level capabilities such as `order_detail_lookup` still apply the retrieval safety cap from rule 7 and say so when it is reached;
- `as_of_date` for recency calculations;
- optional comparison-period bounds.

Each result should include enough metadata to explain the answer: capability used, applied parameters, active result set ID/scope, metric definitions, result rows, and any caveats. The UI should display the answer and appropriate chart/table from those rows. A chart change must reuse the current result rather than issue another data retrieval.

## Dataset assumptions to verify before implementation

TheLook is synthetic ecommerce data. Google documents shopper, order, order-item, product, and web-event tables, and documents `order_items` as item-level purchase records. Before writing the final procedures or queries, profile the live schema and values to verify field names, date coverage, currency/price meaning, status values, timestamp nullability, and join behavior. In particular:

- Use the source's verified completed/returned/cancelled status definitions; do not assume status rules without checking.
- “Overdue” is not supported as a payment concept because this dataset has no invoice due dates. A clearly named “no purchase in N days” inactivity measure is supported instead.
- Do not use synthetic names/emails to imply the records are real people.
- Do not promise every question can be answered. If the requested dimension or measure is absent, explain that and offer a supported alternative.

## AI-selection examples

- “Who spent the most last year?” → `customer_spending`; infer or clarify period; sort by spend descending.
- “Who spent the least in that same period?” → reuse the active customer-spending result set; sort by spend ascending. No new retrieval if the complete bounded result set is retained.
- “Who did business with us more than twice?” → likely `customer_purchase_activity`; clarify completed orders versus item count and interpret “more than twice” as a threshold of at least three only after confirmation.
- “Show that as a pie chart.” → keep the active result and change only presentation; warn if a pie chart would be unreadable or misleading for the result shape.
- “Which products were returned most?” → if returns fields are outside the active result set, explain the current scope and ask before retrieving the returns/cancellations data.
- “Who are our best customers?” → ask whether “best” means highest spend, most orders, or most recent activity.
- “Which category performed best?” → `product_sales_performance` grouped by category (or clarify revenue versus units).
- “Show monthly sales for 2025” → `sales_time_series` for 2025 by month.
- “Compare with the previous year” (a series loaded) → the same series with a `previous_year` comparison: new data, so the switch is confirmed first.
- “Show it by week” or “orders instead” (a series loaded) → a view change; no retrieval.
- “Forecast next year's sales” → refuse; offer the past trend.

**Known limitation (TASK-005 DEC-003):** “Top 10 brands by revenue” was read by the model as a time-series measure on product results in every evaluation attempt and twice in the walkthrough. “Show 10 brands” fails the same way. The app refuses the turn (safely; nothing wrong is shown) and explains what works instead: sort by revenue or items sold, and grouping by brand shows the top 20 brands with the rest as “Other”. A number of brands cannot be chosen yet.

## Implementation boundary

This catalogue is the semantic contract for AI tool selection. The application should implement it using a small set of domain-level, parameterized, read-only data operations (stored procedures, safe query templates, or service functions). It should not expose one operation per example question, and it should not allow the model to generate arbitrary SQL. Keep tool-selection tests separate from data-calculation tests: verify the selected capability/parameters, and verify that each operation returns correct results for its defined semantics.



