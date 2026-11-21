# Decision log: TASK-005 Sales trends and group performance

## DEC-001 — Drawing the "Other" group in bar charts

- **Raised:** 2026-11-15
- **Status:** Approved
- **Discovery and evidence:** the profile (AC-1) shows 2,756 brands, and the top 20 hold only about 22% of revenue ([THELOOK-PROFILE.md](../../../product/THELOOK-PROFILE.md)). Drawn as a bar, the "Other" row (about 78%) would dwarf every brand bar.
- **Affected scope/criteria/files:** [01-spec.md](01-spec.md) S10, AC-8, AC-11.
- **Options and tradeoffs:**
  1. Keep "Other" in the table and the answer, but don't draw it in bar or horizontal-bar charts; a note under the chart says so. The bars stay readable, and the total is still visible in text.
  2. Draw "Other" as a bar, as approved. Shows the full total in the chart, but the brand bars become slivers.
- **Recommendation:** option 1. The table remains the evidence, so nothing is hidden.
- **User decision:** option 1.
- **Decision rationale/date:** readability of the brand comparison; 2026-11-15.
- **Required document/evidence updates:** spec revision 2 (S10, AC-8, AC-11); web tests for the note and the undrawn bar; design-system chart rules (AC-17).
- **Impact on completed work:** none (no grouping code yet). A pie keeps "Other" as a slice, so its slices still add up to the whole (S3 is unchanged).

## DEC-002 — Where interval and measure go in the decision

- **Raised:** 2026-11-15
- **Status:** Approved
- **Discovery and evidence:** AC-3 lists `interval` under `request_data.parameters`, but S5 makes the interval a view setting that never retrieves, and AC-5 adds a charted measure that is also a view setting. Putting interval in both the request and a refinement gives the model two ways to express one change.
- **Affected scope/criteria/files:** [01-spec.md](01-spec.md) AC-3, AC-12; `decision/turn-decision.ts`, `capabilities/registry.ts`.
- **Options and tradeoffs:**
  1. `interval` and `measure` go in the refinement (on the first request and later). `parameters` holds only what changes the query: `product_filter` and `comparison`. There is one way to express each change.
  2. Keep `interval` in `parameters` as written. A later interval change becomes a repeated request with the same scope, and the measure still needs a refinement field.
- **Recommendation:** option 1.
- **User decision:** option 1.
- **Decision rationale/date:** one way to express each change, matching S5; 2026-11-15.
- **Required document/evidence updates:** spec revision 3 (AC-3 wording); schema and registry tests in step 4.
- **Impact on completed work:** none. The validation rules (defaults, boundaries, the 366-day limit for `day`) are unchanged.

## DEC-003 — "Top N brands by revenue" (evaluation case grp-02)

- **Raised:** 2026-11-15
- **Status:** Approved
- **Discovery and evidence:** in the step 16 evaluation, Sonnet 5.5 answered "Top 10 brands by revenue" (product sales loaded) with `refine { group_by: "brand", measure: "revenue" }` and no `limit`. `measure` is a time-series setting (AC-3), so the app refuses the turn with "Intervals, measures, … apply only to sales over time." Every other case passed (60/61, safety 11/11).
  - A prompt rule (full rerun) and then an exact worked example (6-case rerun) did not change it; the model added an `interval` too.
  - The structured-output schema keeps `sort` and `limit`, and other cases use them correctly.
- **Affected scope/criteria/files:** AC-14 (the case fails; the threshold is met); `llm/claude-llm-client.ts`; `live/eval/cases.ts`.
- **Options and tradeoffs:**
  1. Known limitation: keep the validation, keep the prompt rule that the saved baseline was run with, document it, and watch for it in the walkthrough. No spec change.
  2. The backend reads `measure` on a product or customer result as the sort and ignores `interval`. This changes AC-3 and still loses "top 10" (the default 20 brands would show).
  3. Keep trying prompt wording, at uncertain cost and outcome.
- **Recommendation:** option 1.
- **User decision:** option 1.
- **Decision rationale/date:** the threshold is met, the refusal is safe (nothing wrong is shown), and loosening validation for one model habit is not worth a spec change; 2026-11-15.
- **Required document/evidence updates:**
  - The prompt reverted to the rule sentence, so it matches the saved baseline. The worked-example variant was removed.
  - Implementation notes record all three runs.
  - AC-17 docs list the limitation.
  - The walkthrough (AC-16) asks for top brands to see how often it happens.
- **Impact on completed work:** none. The baseline from the second full run stays (60/61, safety 11/11) and matches the current prompt.
- **Follow-up (2026-11-15, user's decision after the walkthrough confirmed it twice):** a clearer refusal, with no spec change. An interval or measure on product or customer results now explains how to rank instead ('…while grouped by brand, ask for a number of brands, for example "show 10 brands"'). The walkthrough W2 fix had already made `measure` an enum (the evaluation was rerun: still 60/61).
- **Second follow-up (2026-11-15, user's decision):** the browser recheck showed that "show 10 brands" fails too.
  - With brands grouped, the model sent `{ group_by: "brand", measure: "revenue" }`, and then twice `{ …, interval: "month" }`. It never sends `limit` for a brand count.
  - The refusal therefore no longer suggests a brand count. It now says: "…To rank products, ask to sort by revenue or items sold. Grouped by brand, the top 20 brands are shown, with the rest combined as Other."
  - **Confirmed limitation:** any request for a number of brands is refused; grouping by brand always shows the top 20.
  - Follow-up candidate for the opportunity review: a dedicated brand-count field in the decision schema, plus tolerating `measure` and `interval` on product results (the schema then reaches the 24-property limit).

## DEC-004 — The table under a brand pie (task review SF-2)

- **Raised:** 2026-11-15 (task review; the choice was made during step 11 and recorded only in the implementation notes)
- **Status:** Approved
- **Discovery and evidence:** S3 says that with a pie "the table lists every group". The web lists every category or department under a pie. For brands it lists the brand cap (top 20) plus "Other", under the title "All brands", which was misleading. The year has about 1,700 brands.
- **Affected scope/criteria/files:** S3, AC-9, AC-11; `web/src/analysis/ResultView.tsx`.
- **Options and tradeoffs:**
  1. Keep the brand cap under a brand pie (S10's limit applies) and title the table for what it lists: 'Brands: top 20 and "Other"'. Categories and departments still list every group.
  2. List every brand (about 1,700 rows). This follows S3 literally, but the table is not useful and needs the backend to return every group.
- **Recommendation:** option 1.
- **User decision:** option 1.
- **Decision rationale/date:** a table of about 1,700 brands is not useful evidence for a 6-slice pie, and S10's cap already governs brands; 2026-11-15.
- **Required document/evidence updates:** the table title (test: `ResultView.test.tsx`, "names the table under a brand pie…"); implementation notes; design-system chart rules.
- **Impact on completed work:** the title only; the data was unchanged.

## DEC-005 — Walkthrough latency and cost (task review SF-3)

- **Raised:** 2026-11-15
- **Status:** Approved
- **Discovery and evidence:** AC-16 asks for per-turn latency and cost to be recorded in the walkthrough. They were not timed during the walkthrough.
- **Options and tradeoffs:**
  1. Accept the evaluation's measurements on the same model, prompt, and schema: median 1.8 s per decision (maximum 5.3 s) and about $0.003 per turn. Add the BigQuery time when data loads: 1.4–5.2 s (known-answer run).
  2. Time a few turns in the browser.
- **Recommendation:** option 1.
- **User decision:** option 1.
- **Decision rationale/date:** the evaluation measures the same calls under controlled conditions; 2026-11-15.
- **Impact on completed work:** none. AC-16 is met with this substitution.
