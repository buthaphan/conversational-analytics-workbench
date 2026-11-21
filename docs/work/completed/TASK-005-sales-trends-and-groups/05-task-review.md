# Task review: TASK-005 Sales trends and group performance

**Spec revision reviewed:** 3 (approved 2026-11-15), DEC-001 to DEC-003  
**Reviewed:** 2026-11-15, uncommitted working tree on `feature/TASK-005-sales-trends-and-groups` against `main`  
**Reviewer:** independent `/task-review`. I did not write this code. Live results are taken from the recorded output only.

## 1. Scope reviewed

**Areas:**
- API:
  - `capabilities/registry.ts`
  - `data/` (`time-series.ts`, `data-source.ts`, `fixture-data-source.ts`, `bigquery-data-source.ts`)
  - `engine/result-engine.ts`, `orchestrator/orchestrator.ts`, `answers/answers.ts`
  - `context/model-context.ts`, `decision/turn-decision.ts`, `llm/claude-llm-client.ts`, `llm/demo-llm-client.ts`
- Prisma: `schema.prisma` and the new migration `20261115120000_time_series_parameters`.
- Live scripts: `known-answer.live.ts`, `profile.live.ts`, `eval/cases.ts`, and the baseline JSON.
- Web: `ChartWithTable.tsx`, `ResultView.tsx`, `Workspace.tsx`, `api.ts`, `format.ts`, `AnalysisCardView.tsx`.
- Every modified and new test file, the four task documents, and the README, catalogue, profile, and design-system diffs.

**Commands I ran** (local only; no network or live suites):

| Command | Result |
|---|---|
| `docker ps` | `cawb-postgres-1` up (healthy) |
| `npm run lint` (root, both workspaces) | exit 0 |
| `npm run typecheck` (root) | exit 0 |
| `npm test` (root) | API: 33 files, **682 passed**. Web: 26 files, **367 passed + 1 expected fail**. Exit 0. Matches the notes' final figures. |
| `npm run build` (root) | exit 0. The web `check:build` passed 2 tests. Vite warns about a 1.42 MB chunk. The full `echarts` import predates this task; the design system records it as an open item. |
| `npx prettier --check` on every changed or new `api/` and `web/` `.ts`/`.tsx` file | All files pass |
| Scratch vitest probe of `validateRequestParameters` and `comparisonPeriod` (scratchpad file outside the repo; no project file changed) | Confirmed findings SF-1 and S-1 below |
| Read-only git: `status`, `diff main --stat`, `diff main -- <path>` | — |

**Not run by me:**
- `npm run live:*` and the BigQuery and Anthropic calls; `npm audit`.
- CI.
- The 320 px browser check.

## 2. Findings

### Blocking

None. I found no defect that shows a wrong figure, leaks data to the model, or breaks a criterion's core behaviour.

### Should fix

**SF-1. A refinement on a series checks the interval against the period's default interval, not the current view.**
- **Where:**
  - `api/src/analysis/orchestrator/orchestrator.ts:797`, the `refine` path;
  - `orchestrator.ts:1006`, the same-data `request_data` path;
  - both call `validateRequestParameters`, which falls back to `defaultInterval(scope)` at `api/src/analysis/capabilities/registry.ts:852`.
- **What:** Take a short period (≤ 31 days, default `day`) loaded by month with a custom comparison longer than 366 days. A measure-only refinement is refused with "Daily figures are available for periods up to 366 days. Choose weekly or monthly.", although the view is monthly and the user asked only for a different measure.
  - My probe: scope 1–20 Jan 2025 with a custom comparison of 2022–2023.
  - Loading with `{interval: "month"}` gives `ok: true`.
  - A refinement of `{measure: "order_count"}` gives `ok: false`, with the issue on `interval`.
- **A related case:** loading the same request without an interval is refused with "choose weekly or monthly", although the user never asked for daily figures.
- **Why it matters:** a valid, already loaded state turns an allowed change (AC-7: interval and measure are always allowed) into a misleading refusal. The case is rare: it needs a custom comparison much longer than the main period.
- **Fix direction:**
  - Pass the current view's interval as the fallback for a refinement on a loaded series (for example `refinement.interval ?? facts.view.interval`).
  - On load, choose a default that is valid for both periods, for example the default of the longer period.
  - Add an orchestrator test for each.

**SF-2. A brand pie's "every group" table shows the top 20 plus "Other" (S3 deviation not in the decision log).**
- **Where:** `web/src/analysis/ResultView.tsx:396` (the table titled `All ${many}`, so "All brands"); `03-implementation-notes.md` step 11, "Decisions within scope".
- **What:** S3 says "the table lists every group". For brands, the table under the pie shows the brand cap (20) plus an "Other (1,690 brands)" row, under the title "All brands".
  - The implementer recorded this as a decision within scope, reasoning that S10's cap wins. It is not in `DECISION-LOG.md`, and the user has not approved it.
  - The title "All brands" overstates what is listed.
- **Why it matters:** S3 and S10 conflict for a pie of brands. Settling that conflict is a spec decision that the user should make, not the implementer.
- **Fix direction:**
  - Raise it as a decision. Option (a): accept the cap for the pie's table and record it. Option (b): list every brand.
  - In either case, retitle the table, for example "Brands (top 20 and Other)", or use "All categories" only when every group is listed.

**SF-3. AC-16's per-turn latency and cost were not measured in the walkthrough.**
- **Where:** `03-implementation-notes.md`, "Per-turn latency and cost".
- **What:** AC-16 requires "Per-turn latency and cost are recorded". The notes say these were not measured and substitute the evaluation's per-decision figures (median 1.8 s, $0.003), plus the known-answer query latency.
- **Why it matters:** a substitute for required evidence needs the user's explicit acceptance; otherwise the criterion is unmet as written.
- **Fix direction:** the user either accepts the substitute (recorded at closeout or in the decision log) or measures a few turns in the browser.

**SF-4. The AC-1 profile does not record the latency of the new queries.**
- **Where:** `docs/product/THELOOK-PROFILE.md`, "Draft capability queries (last 5 years)".
- **What:** AC-1 requires the "bytes and latency of the new queries" in the profile document. The table there has rows and bytes only.
  - The latencies exist in `03-implementation-notes.md` step 15: daily query 1.4–1.5 s, product query 4.1–5.2 s.
- **Fix direction:** add the latencies already measured in step 15 to the profile, with their source (a documentation-only change).

### Suggestions

**S-1. `previous_year` on an exclusive end of 29 February drops a day (spec ambiguity).**
- **Where:** `registry.ts:650` (`yearBefore`, applied to the exclusive `end_date`).
- **Probe:** a period of 1 Mar 2027 – 28 Feb 2028 (exclusive end 2028-02-29) gets the comparison 1 Mar 2026 – 27 Feb 2027 (exclusive end 2027-02-28), so 28 Feb 2027 is missing.
- This applies S8's wording literally ("29 Feb → 28 Feb"), but S8 does not say whether that rule applies to the exclusive end. It occurs, for example, for "last 12 months" asked on 29 Feb.
- **For the decision process:** clarify whether an exclusive end of 29 Feb maps to 1 Mar.

**S-2. The web computes two figures.**
- **Where:** `ResultView.tsx:232`, the per-bucket change in a compared table; `ResultView.tsx:405–406`, the "Other" share in the DEC-001 note.
- The notes disclose both, and both are derived from backend values in whole cents.
- Under the project rule that the data layer calculates, consider returning both from the engine, as the period totals' change already is. Then the web only formats.

**S-3. A compared series cut off at today compares unequal coverage.**
- **Where:** `answers.ts:318` and the comparison sentence after it.
- Example: "2026 vs previous year", asked in November. The answer says "down X%" against a full 2025, and the cut-off note sits beside it.
- This is correct and descriptive, but easy to misread. Consider saying that the comparison period is complete while the current one is not, or flag it for a spec decision.

**S-4. The series scope summary counts both periods' days.**
- **Where:** `ResultView.tsx:51`.
- "731 days in the result" for 2025 vs 2024 counts both periods. Consider "365 days (plus 366 compared)".

**S-5. Process: step 8 has no red phase.**
- The notes state that step 8's 17 orchestrator tests were never run red. The tests are meaningful and pass, so this is recorded only as a TDD deviation.

## 3. Acceptance criteria

Live results (AC-1, AC-12 smoke call, AC-13, AC-14) are evidenced only by the recorded output in `03-implementation-notes.md` and the baseline file; I could not rerun them.

| AC | Status | Evidence |
|---|---|---|
| AC-1 | **unmet** (documentation gap only, SF-4) | Profile section "Departments, brands, and daily sales" has the departments, 2,756 brands, 24 null brands, the per-brand spread, the daily ranges for 1 and 5 years, bytes, and the caps confirmed with reasons (brand 20, series 4,000). The latency is missing from the profile. |
| AC-2 | met | **Registry:** `brand` has `listValues: false`. **Fixture and BigQuery tests:** department and brand, a null brand → "Unknown brand" (`bigquery-data-source.test.ts` "maps product rows…", "selects and groups by department and brand"). **Model context:** the `model-context.test.ts` seed has 50 "Brandsecret NN" brands on the leak list, and `valueCounts` = `{ brand: 50 }`. **Refused brand filters** list no options and name no stored brand (`registry.ts` `validateFilter`; orchestrator test). |
| AC-3 | met | `turn-decision.test.ts`, plus `registry.test.ts` for the 31/32, 92/93, and 366/367 boundaries, comparison periods, unknown values, and the wrong capability. Since W2, an unknown measure is rejected by the schema enum (invalid-decision reply), not by a clarification; the registry check remains. SF-1 is an edge defect in how the interval is re-checked after load. |
| AC-4 | met | **Code:** `time-series.ts` (zero-fill, today cut-off, row checks); `DAILY_SALES_SQL` (fixed text, every value a typed parameter including `ARRAY<STRING>`); `TIME_SERIES_ROW_CAP` 4,000. **Tests:** `time-series.test.ts`; `bigquery-data-source.test.ts` (no values in the SQL text, the same SQL for every request, mapping, malformed rows, errors without details). Baseline dates are tested in `registry.test.ts`, with the S-1 caveat. |
| AC-5 | met | `result-engine.ts` `series()`: SQL `date_trunc` with a bound interval, partial flags, pairing by position, totals in cents, `percent: null` from zero. Engine tests (test DB) cover sums for day, week, and month on the 2025 fixture; an ISO week across a year; partial buckets; the today bucket; 31 vs 28 days; and a zero baseline. |
| AC-6 | met | `sameParameters` (filter as a set; the resolved comparison period). Orchestrator tests: a different filter, no filter, a department filter, an added or removed comparison, a different scope, each with switch wording and no retrieval; confirming retrieves. Interval and measure never retrieve. |
| AC-7 | met | Orchestrator "what applies to the series": the summary names the lowest and highest bucket; sort, limit, measure filter, grouping, and concentration are each refused with an alternative and change nothing. `pie` and `horizontal_bar` refusals are in the AC-9 matrix. |
| AC-8 | met (DEC-003 limitation) | `engine.groups()`: filters first, sort by measure and direction, brand top 20 or `groupLimit`, "Other" exact in cents. Engine and orchestrator tests cover each dimension, `none`, a brand number over 30, customers refused, and `displayed` refused while grouped. The `group` operation is removed from the schema and registry. The user's brand number works in the backend but in practice the model never sends it (DEC-003, accepted). |
| AC-9 | met | The orchestrator view × shape matrix covers all 15 pairs, with refusals keeping the current view and no retrieval. Name normalization is tested. Pies with 2, 6, 7 (Other 2), and 26 (Other 21) groups are tested in `result-engine.test.ts`. The defaults are line and bar. |
| AC-10 | met | `answers.test.ts` covers the series answer, partial buckets, the cut-off, up / down / no change / zero baseline (each checked for causal words), unequal lengths, the grouped answer with Other, and the pie rule. |
| AC-11 | met (320 px by user report only) | `ChartWithTable.test.tsx` covers horizontal bars, pie labels, no raw colors, the table view, extra columns, table-only rows, and the note. `ResultView.test.tsx` covers partial marks, two named lines with gaps, the comparison table, the period totals, the scope summary, the DEC-001 note, and the pie table, with axe on the new views. The 320 px reflow is not covered by a test; the user reported it in the walkthrough. See SF-2 on the brand pie's table. |
| AC-12 | met | The schema is strict, with `parameters`, `group_by`, `interval`, and `measure` (enum). Optional properties: 23, within the guard. Catalogue `whenToUse` and `clarifyWhen` are covered by `model-context.test.ts`. Demo examples are covered by `demo-llm-client.test.ts`. The smoke call (step 5) was accepted by the API, per the recorded output. |
| AC-13 | met (recorded output) | Notes step 15: 17/17 passed; daily rows equal for mixed statuses, the month boundary, a category filter, and the previous year with a department filter; product rows with department and brand equal; 21 rows hand-checked (≥ 3 per query). The evidence is adequate for the criterion. |
| AC-14 | met (recorded output) | `baseline.claude-sonnet-5-5.json` summary: 61 cases, 60 passed (98.4%), safety 11/11, max 5.3 s, $0.19. 24 new cases; `grp-02`'s expectation is not weakened (`group_by: brand, limit: 10`). The only failure is `grp-02` (DEC-003). I cannot confirm from the file that the prompt is unchanged since that run (it stores no prompt hash); the notes say the later changes were application text only. |
| AC-15 | **unverified** | I reproduced lint, typecheck, build, and `npm test` locally (see section 1). The live suites stay out of `npm test`. Each existing test change is justified (section 4). CI has not been run or reported. |
| AC-16 | **unmet** as written (SF-3) | The notes record the user completing every step, with W1–W4 fixed and rechecked and step 11 confirmed as DEC-003. The per-turn latency and cost were not measured; evaluation figures are substituted. User confirmation is reported in the notes; I cannot verify it. |
| AC-17 | met | Catalogue: implementation status, `product_group_performance` deferred (S1), "As built" sections, DEC-003. Design system: "Chart rules per result shape". README: views, switches, costs, live checks, known limitations. Profile: as AC-1. |

### Definition of Done

| Item | Status |
|---|---|
| Every acceptance criterion met with evidence | Not yet: AC-1 (documentation), AC-15 (CI), AC-16 (measurements) |
| Tests and checks pass (API, web, lint, typecheck, format, builds, audit) | Local checks reproduced. Prettier is clean on the changed files; the full `format:check` was not run by me (the notes cite a CRLF working-copy issue that predates the task; CI decides). Audit: notes record 0 production vulnerabilities and 9 moderate, development-only, pre-existing (user-approved run). |
| Known-answer and evaluation threshold met; new baseline stored | Yes, per the recorded output |
| Review findings resolved or accepted by the user | Open: SF-1 to SF-4 |
| Documentation, profile, and known limitations current | Yes, apart from SF-4 and the SF-2 title |
| User completes the walkthrough | Reported in the notes, with the SF-3 gap |
| User accepts closeout; CI state reported | Pending |

## 4. Test-change audit

| Test file: change | Justified? |
|---|---|
| `registry.test.ts`: "defines exactly the two TASK-003 capabilities" → three capabilities; the "undefined capability" example is now `repeat_purchase_behavior` | Yes. AC-4 adds `sales_time_series`. |
| `registry.test.ts`: `group` analysis cases removed | Yes. AC-8 removes the operation; equivalent `group_by` and schema-rejection tests were added. |
| `model-context.test.ts`: allowed values exclude brand; the catalogue has three entries; `analyses.groupBy` → `grouping` | Yes (AC-2, AC-8, AC-12). Stronger: a leak list with 50 brands. |
| `result-engine.test.ts`: product rows gain department and brand; the `allowedValues` expectation includes them; the `group` analysis test is replaced by grouped-view tests | Yes. The backend still needs every brand (AC-2); the grouping move is per AC-8. The coverage is broader. |
| `bigquery-data-source.test.ts` and `fixture-data-source.test.ts`: product mapping includes the new fields | Yes (AC-2). The assertions were extended, not loosened. |
| `orchestrator.test.ts`: the pie refusal text changed; the test data source gains `fetchDailySales`; "profit" measure → `ANSWERS.invalidDecision` | Yes. The pie now exists but does not suit customer rows (AC-9). The measure became a schema enum in the W2 fix; the registry check is still covered in `registry.test.ts`. |
| `conversations.http.test.ts` step 6: pie refusal wording | Yes (AC-9). The view still stays `table`. |
| `claude-llm-client.test.ts`: fixture context shape | Yes (AC-12 context shape). |
| `demo-llm-client.test.ts`: "Revenue by category" → `refine { group_by }` | Yes (AC-8). |
| `Workspace.test.tsx`: empty-state text; three DEC-004 layout assertions moved from `100vh` classes to bounded-grid classes, plus a new compared-series test | Yes (walkthrough W1). The goal (no page scroll on wide screens) is still asserted, and the new assertions are stricter (exact height, no `100vh` sums). The real layout cannot be proved in jsdom; the user rechecked it. |
| `cases.ts`: `demo-18` expectation moved from `analyze group` to `group_by` | Yes. AC-14 explicitly requires this update. |

No test was deleted without replacement or weakened to get a pass.

## 5. Security and privacy notes

**Model boundary**
- The model context lists brand values only as a count (`valueCounts`).
- A refused brand filter, which becomes the stored pending question, names only the value the user typed.
- A series' context carries parameters and view settings, not daily figures (tested).
- Grouped figures, pie shares, and series buckets go only to the web state, never to the model context.
- Brand values can reach the context only when the user typed them in a filter.

**Validating model output**
- The schema is strict throughout, with enums for `group_by`, `interval`, `measure`, the filter field, and the baselines.
- The filter values are bounded (1–10, ≤ 100 characters) and checked against the profiled lists.
- Custom comparison dates go through `validateScope`.
- View names are normalized against an allowlist. The echoed unknown name is at most 32 characters and is application reply text.

**SQL safety**
- **BigQuery:** `DAILY_SALES_SQL` is fixed. Dates, the comparison flag and dates, the filter field and values, and the row limit are typed parameters, and the tests assert that no value appears in the SQL text. Only the constant dataset name is interpolated, as before.
- **PostgreSQL:** the interval is a bound value, field names go through `fieldKey` as bound JSON keys, and aliases are regex-checked. The sort field is validated by the registry first.

**Other checks**
- **Live scripts:** they interpolate only the constant dataset name.
- **Logging:** retrieval failures are logged by error name only. BigQuery errors are wrapped without details, and adapter row errors become a failed retrieval.
- **Migration:** additive and nullable (`parameters JSONB`, `as_of DATE`) on `result_sets`. It is deleted with the session (existing cascade); no backfill is needed.
- **Data and dependencies:** public sample data only, and no new personal fields. No dependency was added.

## 6. Recommendation

**Pending user decision**, then a short return to implementation for small fixes before closeout.

- No blocking defects. The behaviour, tests, and recorded live evidence support AC-2 to AC-14 and AC-17.
- **User decisions needed:**
  - SF-2: the brand pie's table vs S3; record the decision and retitle the table.
  - SF-3: whether evaluation-based latency and cost are acceptable for AC-16.
  - S-1 and S-3, optionally: the spec ambiguities for the decision process.
- **Small implementation and documentation fixes:**
  - SF-1: a code fix plus tests;
  - SF-4: add the measured latencies to the profile.
- After that: rerun the affected API tests, report CI (AC-15), then closeout.
