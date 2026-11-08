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
