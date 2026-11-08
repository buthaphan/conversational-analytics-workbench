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

## Pending

- **Anthropic billing:** not yet checked by the user (Claude Max credits are normally separate from Console API billing). Blocks the first live Claude call (plan step 9), not the specification or the credential-free steps.
