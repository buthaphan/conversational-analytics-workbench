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
| `products`    | 29,120  | 4.3 MB  | `id`, `name`, `category`                                                                              |

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

## Cost and limits

- Measured with the capability queries (known-answer run, 2026-11-08; order-date window):

  | Query                           | Rows   | Processed | Latency |
  | ------------------------------- | ------ | --------- | ------- |
  | Customer spending, last 1 year  | 11,762 | 10.1 MB   | 2.2 s   |
  | Product sales, last 1 year      | 13,621 | 9.8 MB    | 3.6 s   |
  | Customer spending, last 5 years | 25,790 | 10.1 MB   | 4.2 s   |
  | Product sales, last 5 years     | 22,231 | 9.8 MB    | 5.1 s   |

  Latency includes the transfer of all rows to the API. The BigQuery Sandbox free tier is 1 TB of queries per month (as recorded in the architecture proposal; not re-verified online), so showcase use is far inside it.

- Every application job sets a bytes-billed cap, so a mistaken query fails instead of scanning more.
- Nothing is stored in BigQuery, so the Sandbox's storage limit and table expiry do not apply.
