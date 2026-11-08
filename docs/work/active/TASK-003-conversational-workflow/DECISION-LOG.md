# Decision log: TASK-003 Conversational workflow

Record only material decisions or change requests. Keep pending questions visible and pause dependent work until the user decides.

## DEC-001 — Browser demonstration in TASK-003

- **Raised:** 2026-11-08
- **Status:** Approved
- **Discovery and evidence:** TASK-003 has no Anthropic key (decision B is wired up in TASK-004), so its model adapter is a fake that cannot understand free text.
- **Options and tradeoffs:**
  1. **Development demo model:** a clearly labelled, development-only adapter that recognises a fixed list of example sentences and returns the matching TurnDecision. The user can click through the real workflow in the browser; any other text gets a "demo mode: try one of these examples" reply. Slightly more scope; refused in production.
  2. **Automated tests only:** the workflow is proven by API tests with a scripted fake and by UI component tests; no browser conversation until TASK-004. Smaller scope.
- **Recommendation:** Option 1.
- **User decision:** Option 1, the development demo model.
- **Decision rationale/date:** Lets the user see and review the workflow before credentials are set up. 2026-11-08.
- **Required document/evidence updates:** `01-spec.md` (demo-model criterion and manual walkthrough).
- **Impact on completed work:** None.

## DEC-002 — Turn lock and session end (review R1, R7)

- **Raised:** 2026-11-08 (task review round 1)
- **Status:** Approved
- **Discovery and evidence:**
  - Each turn holds the analysis session's row lock for its whole transaction (up to 120 s), including the model call and the retrieval.
  - A session end (sign-out, expiry, or replacement) during a slow turn makes the 5 s cleanup transaction time out. The analysis data then stays until the sweeper retries (R1).
  - A sign-in elsewhere during a turn of about 25 s or more fails (R1).
  - A refresh during a slow first turn can fail to load (R7).
  - With the demo model and the fixture, turns are instant, so none of this occurs in TASK-003.
- **Options and tradeoffs:**
  1. **Fix in TASK-003:** release the lock before the model call and re-check the facts afterwards, or give cleanup a longer lock wait. More work now, tuned without real latencies.
  2. **Defer to TASK-004:** that task introduces real latency and can measure it. It is recorded as required work in the handover.
- **Recommendation:** Option 2.
- **User decision:** Option 2, defer to TASK-004.
- **Decision rationale/date:** The issue is latent until a real model is connected. 2026-11-08.
- **Required document/evidence updates:** `TASK-004-HANDOVER.md` (required work), `03-implementation-notes.md`.
- **Impact on completed work:** None.

