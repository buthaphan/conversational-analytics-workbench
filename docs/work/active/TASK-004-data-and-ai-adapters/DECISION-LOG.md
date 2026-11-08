# Decision log: TASK-004 Real data and AI adapters

Record only material decisions or change requests. Keep pending questions visible and pause dependent work until the user decides.

## DEC-001 — Turn lock: two-phase turn (TASK-003 R1, R7)

- **Raised:** 2026-11-08 (carried from TASK-003 DEC-002)
- **Status:** Approved
- **Discovery and evidence:** Each turn holds the analysis-session row lock through the model call and the retrieval (up to 120 s). Session-end cleanup, sign-in elsewhere, and a refresh during a first turn can wait on it and fail ([TASK-004-HANDOVER.md](../../completed/TASK-003-conversational-workflow/TASK-004-HANDOVER.md#4-required-work-turn-lock-and-session-end-dec-002)).
- **Options and tradeoffs:**
  1. **Two-phase turn:** a short locked step marks a turn in progress and snapshots the facts; the model call and retrieval run without a lock; a second short locked step saves the outcome, or discards it if the session ended. Fixes R1 and R7. A second message or Switch during a turn is refused immediately instead of queueing.
  2. **Bound cleanup's lock wait only:** smaller, but data stays until the sweeper retries and R7 remains.
- **Recommendation:** Option 1.
- **User decision:** Option 1.
- **Decision rationale/date:** Session end must never depend on a slow turn. 2026-11-08.
- **Required document/evidence updates:** `01-spec.md` AC-1, AC-2; TASK-003 AC-12's "serialized concurrent POSTs" is replaced by the AC-1 refusal rule.
- **Impact on completed work:** The TASK-003 concurrent-POST test changes expectation (serialized → refused with `turn_in_progress`). No other accepted behavior changes.

## DEC-002 — Who runs live calls

- **Raised:** 2026-11-08
- **Status:** Approved
- **Options:** (1) Claude writes the scripts and runs each live BigQuery or Anthropic call after the user approves it; (2) the user runs them.
- **User decision:** Option 1. Claude asks before each live run, never opens or prints credentials, and the SDKs read credentials from the environment.
- **Decision rationale/date:** Faster iteration on profiling, the known-answer check, and the evaluation. 2026-11-08.

## DEC-003 — Client libraries

- **Raised:** 2026-11-08
- **Status:** Approved
- **Options:** (1) official SDKs `@anthropic-ai/sdk` and `@google-cloud/bigquery`; (2) plain HTTP with hand-written OAuth handling.
- **User decision:** Option 1. Exact versions are chosen at install time and shown to the user in the install permission prompt; the dependency audit is recorded.
- **Decision rationale/date:** Maintained auth, timeouts, retries, and structured output support. 2026-11-08.

## DEC-004 — Walkthrough layout feedback

- **Raised:** 2026-11-08 (AC-12 walkthrough, user screenshot)
- **Status:** Approved (requested by the user)
- **Discovery:** with real data the workspace does not fit the screen: the logo is too small to read, the scope summary card is tall, and the chart (320 px) plus a 10-row table push the page well below the fold.
- **Change:**
  - The logo is shown larger.
  - The scope summary is laid out in two columns on wide screens.
  - The workspace chart is shorter.
  - The result table scrolls inside a fixed-height, keyboard-focusable region, so the scope, chart, table, and conversation fit one screen at about 1080 px height.
  - The design-system defaults (`ChartWithTable` without `compact`) are unchanged.
- **Follow-up requests (same walkthrough):**
  - A compact scope summary: smaller heading size (the heading level is unchanged), bold term labels, small text. Done through a new `Card` `compact` option.
  - **Reverted:** the whole type scale was made one step smaller, but the user had been viewing at browser zoom; on request the TASK-002 scale is restored (body 16 px). Net change to the design tokens: none.
  - Scrolling frames stay in place: the table's own bordered region scrolls (new `Table` `maxHeight` option, with sticky column headers), replacing the earlier wrapper, whose scrolling moved the table border out of view. The conversation panel scrolls inside its own bordered frame.
  - On wide screens the result table's maximum height follows the window (`max(10rem, 100vh - 37rem)` with the chart, `100vh - 21rem` table-only), like the conversation panel, so the page itself does not scroll.
  - Denser result tables (new `Table` `dense` option: 4 px row padding, caption size). In the chart view, the table caption, which repeats the chart title just above, is visible to screen readers only (`hideCaption`).
  - With a result shown on wide screens, the conversation column's height matches the result column (the section is positioned out of the grid's height calculation; the history takes the remaining space and scrolls).
  - **Header colour** (user's choice of three options, 2026-11-08): brand navy, with a new light logo variant (`assets/brand/logo-on-dark.svg`, copied to `web/src/`), white email text, and a white focus ring on the Sign out button. The contrast pairings `on-primary` on `brand-navy` (text and UI) are declared and tested. `colorLiterals.test.ts` exempts the new logo file, like the existing one.
  - Chart text (axis labels, legend, tooltip) takes its size from the caption token (12 px with the restored scale).
  - **Logo only in the header:** the separate title text, which repeated the logo, is removed. The logo is the page `h1`, named by its alt text.
  - **Fill the window:** on wide screens the grid is at least `100vh - 9.5rem` tall (not in demo mode); the result card stretches and the chart grows (minimum 14rem), so the result and the conversation reach the bottom of the window.
- **Impact:** presentation only; no API or behavior change. Web tests added for the scroll region. The user confirms in the browser.

## Resolved items

- **Anthropic billing** (resolved 2026-11-08): the user uses a Console account with $20 of prepaid API credit, and auto-reload is advised off. The idea record's Claude Max credit assumption does not apply.
- **Server-side refusal fallback** (user, 2026-11-08): keep it on (`fallbacks: "default"`).
- **Evaluation budget** (user, 2026-11-08): up to 5 runs. Used: 3 full runs (the first rejected with HTTP 400, unbilled) and 2 single-case probes, about $0.20 in total.

## Pending

- None.
