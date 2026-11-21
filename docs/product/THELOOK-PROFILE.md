# TheLook profile

**Dataset:** `bigquery-public-data.thelook_ecommerce` (Google's synthetic e-commerce data; not real customers or business data)  
**Profiled:** 2026-11-08, TASK-004 AC-5. Queries: `api/src/live/profile.live.ts` (`npm run live:profile -w api`).  
**Location:** `US` (every job runs there).

TheLook is regenerated continuously: its newest rows are only days old, and some are dated in the future. Counts below are a snapshot; the same scope can return slightly different results on another day.

## Tables used

| Table         | Rows    | Size    | Fields used                                                                                           |
| ------------- | ------- | ------- | ----------------------------------------------------------------------------------------------------- |
| `order_items` | 181,610 | 13.6 MB | `order_id`, `user_id`, `product_id`, `status`, `sale_price` (INT64 IDs, STRING status, FLOAT64 price) |
| `orders`      | 125,136 | 6.8 MB  | `order_id`, `created_at` (TIMESTAMP)                                                                  |
| `users`       | 100,000 | 19.8 MB | `id`, `first_name`, `last_name`                                                                       |
| `products`    | 29,120  | 4.3 MB  | `id`, `name`, `category`, `department`, `brand` (the last two from TASK-005)                          |

No table is partitioned or clustered. All columns are nullable in the schema. Not selected: emails, addresses, locations, age, gender, and every other personal field.

## Status

| `order_items.status` | Items  |
| -------------------- | ------ |
| Shipped              | 54,727 |
| Complete             | 45,407 |
| Processing           | 36,155 |
| Cancelled            | 27,235 |
| Returned             | 18,086 |

- No other values and no nulls.
- An order's status always equals its items' status (0 differences), and no order mixes item statuses.
- Timestamps follow the status: Complete items have shipped and delivered dates and no return date; Returned items have all three; Cancelled and Processing have none.
- **Rule kept:** only `Complete` items count (the reference rule). Shipped items are not yet completed purchases.

## Date window

- `order_items.created_at` is never null. Item creation runs from 2019-01-29 to 2026-11-12; 1,663 items are dated in the future (after the profiling time).
- An item's `created_at` differs from its order's: from 3 hours before to 96 hours after (quartiles −3, −2, 0, 46, 96 hours). 82,053 items fall on another calendar date than their order, and 32,325 orders (26%) have items on more than one date.
- **Decision:** the window uses **`orders.created_at`** (when the order was placed), compared as a UTC date: `start_date <= DATE(o.created_at) < end_date`. Every item of an order then falls into the same window, so `order_count` and `avg_order_value` never split an order across two periods. This matches the reference fixture, where an item's date is its order's date. (The spec's initial recommendation was `order_items.created_at`; the profile changed it, as the spec allows.)
- Future-dated rows are included only when a scope reaches into the future; scopes normally end today (exclusive).

## Money

- `sale_price` is FLOAT64 with binary noise (for example 0.0199999995529651); 97,794 items are not exact to 2 decimals. Range 0.02 to 999.00, never zero or negative, never null.
- `sale_price` always equals the product's `retail_price` (0 differences).
- The data has no currency field; amounts are shown as US dollars, as in TheLook's documentation.
- **Rule kept:** each item is rounded to whole cents, and the cents are summed (the reference rule); this removes the float noise.

## Names and categories

- No user lacks a first or last name; no item lacks its user or product.
- 2 products have no name: shown as `Product <id>`.
- 1,568 product names occur more than once; the product ID tells them apart.
- 26 categories, none null (Accessories, Active, Blazers & Jackets, Clothing Sets, Dresses, Fashion Hoodies & Sweatshirts, Intimates, Jeans, Jumpsuits & Rompers, Leggings, Maternity, Outerwear & Coats, Pants, Pants & Capris, Plus, Shorts, Skirts, Sleep & Lounge, Socks, Socks & Hosiery, Suits, Suits & Sport Coats, Sweaters, Swim, Tops & Tees, Underwear).
- Customer display name: `first_name || ' ' || last_name` (synthetic).

## Result sizes (Complete items, snapshot)

| Scope         | Customers | Products | Items  |
| ------------- | --------- | -------- | ------ |
| Calendar 2025 | 6,644     | 8,596    | 10,143 |
| Last 1 year   | 11,705    | 13,399   | 18,022 |
| Last 2 years  | 17,452    | 17,782   | 27,561 |
| Last 5 years  | 25,721    | 22,130   | 41,706 |

(Measured with item dates, before the window decision; the capability queries' own row counts for these scopes are recorded with the known-answer check.) Upper bounds: 100,000 users and 29,120 products in total.

Complete items per year: 2019: 359; 2020: 1,153; 2021: 2,120; 2022: 3,367; 2023: 4,730; 2024: 6,860; 2025: 10,143; 2026 (to date): 16,675. The data grows quickly toward the present.

**Row caps (AC-8):** 50,000 rows for both capabilities. Even the maximum 5-year scope fits with about twice the headroom for customers; products can never exceed 29,120.

## Departments, brands, and daily sales (TASK-005)

**Profiled:** 2026-11-15 (BigQuery `CURRENT_DATE()` was 2026-11-14 UTC), TASK-005 AC-1. Queries: the `task005_` entries in `api/src/live/profile.live.ts` (`npm run live:profile -w api -- -t task005`). Same rules as the capability queries: `Complete` items, window on the order's UTC date, cents per item.

**Departments**
- Two values, never null: `Men` (13,131 products, 14 categories) and `Women` (15,989 products, 22 categories).
- 12 categories occur in both departments (for example Jeans, Sweaters, Tops & Tees). The other 14 occur in one only, for example Dresses (Women) and Suits & Sport Coats (Men). A category filter and a department filter therefore combine meaningfully.

**Brands**
- 2,756 distinct brands. 24 products have no brand, shown as "Unknown brand". No blank or untrimmed values. The longest name is 41 characters.
- 37 brand names differ from another only by letter case or spacing. They are kept as separate brands, exactly as in the source.
- Products per brand are very uneven: half the brands have 1–2 products, 90% have at most 22, and the largest has 1,034.
- Revenue is spread thinly. Brands with sales: 2,092 in the last year and 2,512 in the last 5 years. Share of revenue held by the top 5, 20, and 30 brands: 8.5%, 22.3%, and 28.2% (last year), and 8.9%, 22.5%, and 28.5% (5 years). A top-20 view therefore leaves about 78% of revenue in "Other".
- **Brand cap (TASK-005 S10):** 20 is kept. 30 adds only about 6 points of share, and longer lists stop being readable.

**Daily sales**
- Last year: sales on all 365 days, with 15–663 items, 11–449 orders, and $850.67–$39,063.48 per day.
- Last 5 years: sales on 1,823 of 1,826 days, so a few early days are empty and show as zero. 1–663 items and $23.99–$39,063.48 per day.
- Orders dated today or later: 11 orders with 15 completed items, all dated 2026-11-14 (UTC today at the time of the run). None were dated after today in this run.
- **Time-series row cap (TASK-005 AC-4):** at most 1,827 days per period, so 3,654 rows with a comparison period. The cap is set to **4,000**.

**Draft capability queries (last 5 years)**

| Query | Rows | Processed |
| --- | --- | --- |
| Product sales with department and brand | 22,138 | 8.9 MB |
| Daily sales, category filter (Jeans, Sweaters) | 1,578 | 7.0 MB |

The product query stays within its 50,000-row cap. The daily query scans about the same amount as the existing capability queries.

## Cost and limits

- Measured with the capability queries (known-answer run, 2026-11-08; order-date window):

  | Query                           | Rows   | Processed | Latency |
  | ------------------------------- | ------ | --------- | ------- |
  | Customer spending, last 1 year  | 11,762 | 10.1 MB   | 2.2 s   |
  | Product sales, last 1 year      | 13,621 | 9.8 MB    | 3.6 s   |
  | Customer spending, last 5 years | 25,790 | 10.1 MB   | 4.2 s   |
  | Product sales, last 5 years     | 22,231 | 9.8 MB    | 5.1 s   |

- Measured with the final TASK-005 queries (known-answer run, 2026-11-15; AC-1):

  | Query                                                 | Rows   | Processed | Latency |
  | ----------------------------------------------------- | ------ | --------- | ------- |
  | Sales over time, last 1 year + previous period         | 730    | 8.1 MB    | 1.4 s   |
  | Sales over time, last 5 years + previous period        | 2,613  | 8.1 MB    | 1.5 s   |
  | Customer spending, last 1 year                        | 11,471 | 10.2 MB   | 2.5 s   |
  | Product sales (with department and brand), last 1 year | 13,468 | 10.3 MB   | 4.1 s   |
  | Customer spending, last 5 years                       | 25,775 | 10.2 MB   | 3.8 s   |
  | Product sales (with department and brand), last 5 years | 22,140 | 10.3 MB  | 5.2 s   |

  Sales over time transfers at most one row per day and period, so it is the fastest query; 5 years with a comparison stays well under its 4,000-row cap.

  Latency includes the transfer of all rows to the API. The BigQuery Sandbox free tier is 1 TB of queries per month (as recorded in the architecture proposal; not re-verified online), so showcase use is far inside it.

- Every application job sets a bytes-billed cap, so a mistaken query fails instead of scanning more.
- Nothing is stored in BigQuery, so the Sandbox's storage limit and table expiry do not apply.
