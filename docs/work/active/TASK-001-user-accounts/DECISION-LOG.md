# Decision log: TASK-001 User accounts and sign-in

Record only material decisions or change requests. Keep pending questions visible and pause dependent work until the user decides.

## DEC-001 — Sign-in UI before the design-system task

- **Raised:** 2026-11-08
- **Status:** Approved — option 2
- **Discovery and evidence:** [DESIGN-SYSTEM.md](../../../design/DESIGN-SYSTEM.md) says typography, tokens, and component conventions must be decided "before adding UI implementation patterns". TASK-001 needs a sign-in screen and a signed-in shell, and no design-system task exists yet.
- **Affected scope/criteria/files:** TASK-001 UI criteria in `01-spec.md`; future design-system task.
- **Options and tradeoffs:**
  1. Provisional minimal UI: brand colors and logo, Tailwind defaults, accessible form, no reusable design tokens or component conventions; restyled in the design-system task. Keeps TASK-001 moving; small rework later.
  2. Run a design-system task first. Consistent from the start; delays sign-in and the foundation.
- **Recommendation:** Option 1.
- **User decision:** Option 2 — run a design-system task before any UI. TASK-001 specification is paused until that task's tokens and component conventions are approved.
- **Decision rationale/date:** Consistent UI from the start, 2026-11-08.
- **Required document/evidence updates:** `00-context.md` status; a new design-system idea record on `main`; `01-spec.md` (when resumed) must reference the approved design system.
- **Impact on completed work:** None. Decisions DEC-002 to DEC-004 below stay valid for the resumed spec.

## DEC-002 — Session keep-alive

- **Raised:** 2026-11-08
- **Status:** Approved
- **Options and tradeoffs:**
  1. Any open tab pings the server; the session ends about 10 minutes after the last tab closes. A forgotten open tab stays signed in.
  2. Visible tab only; a hidden or minimized tab for more than 10 minutes signs out.
  3. User activity only; an idle open page signs out after 10 minutes.
- **Recommendation:** Option 1; it matches "closing without signing out counts as signing out" without signing out a user who is reading.
- **User decision:** Option 1 — any open tab keeps the session alive.
- **Decision rationale/date:** 2026-11-08.
- **Required document/evidence updates:** `01-spec.md` session criteria and tests (including browser timer throttling in background tabs staying under the 10-minute window).
- **Impact on completed work:** None.

## DEC-003 — Password hashing

- **Raised:** 2026-11-08
- **Status:** Approved
- **Options and tradeoffs:** Node built-in `crypto.scrypt` (no extra dependency); Argon2id via `argon2` (native dependency); bcrypt (native dependency, 72-byte limit).
- **Recommendation:** Node built-in scrypt with OWASP-recommended parameters and a per-password random salt.
- **User decision:** Node built-in scrypt.
- **Decision rationale/date:** No native dependency in Docker or CI, 2026-11-08.
- **Required document/evidence updates:** `01-spec.md` security criteria.
- **Impact on completed work:** None.

## DEC-004 — Database tooling

- **Raised:** 2026-11-08
- **Status:** Approved
- **Options and tradeoffs:** Prisma (typed client and migrations; generation step); Kysely with its migrator (lightweight, more manual typing); TypeORM (heavier, more implicit).
- **Recommendation:** Prisma.
- **User decision:** Prisma. Installing it still requires approval at implementation time.
- **Decision rationale/date:** 2026-11-08.
- **Required document/evidence updates:** `01-spec.md` dependencies; `02-implementation-plan.md`.
- **Impact on completed work:** None.
