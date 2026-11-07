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

## DEC-005 — Docker Compose layout

- **Raised:** 2026-11-08 (project open decision #8)
- **Status:** Approved
- **Options and tradeoffs:**
  1. Full stack plus fast development: `docker compose up` runs PostgreSQL, API, and web (built app served with `/api` proxied on the same origin, like the showcase). For coding, run only PostgreSQL in Docker and web/API with npm for instant reload. CI builds both images.
  2. PostgreSQL only in Docker; web and API always via npm. Simplest; no app containers until a deployment task.
  3. Everything in Docker with live reload. One command, but slower and fiddly file watching on Windows.
- **Recommendation:** Option 1.
- **User decision:** Option 1.
- **Decision rationale/date:** Production-like same-origin setup without slowing day-to-day work. 2026-11-08.
- **Required document/evidence updates:** `01-spec.md` scope and criteria; `PROJECT-SETUP.md` open decision #8.
- **Impact on completed work:** None.

## DEC-006 — Sign-in rate limiting

- **Raised:** 2026-11-08
- **Status:** Approved
- **Options and tradeoffs:**
  1. Count failed attempts in PostgreSQL: 5 failures per email in 15 minutes, plus 20 per IP address in 15 minutes. Survives restarts and works with more than one API instance.
  2. Same limits in API memory (NestJS throttler). Simpler; counts reset on restart and are per instance.
- **Recommendation:** Option 1.
- **User decision:** Option 1.
- **Decision rationale/date:** 2026-11-08.
- **Required document/evidence updates:** `01-spec.md` security criteria and data model.
- **Impact on completed work:** None.

## DEC-007 — Absolute session lifetime

- **Raised:** 2026-11-08 (project open decision #1, partly)
- **Status:** Approved
- **Options and tradeoffs:** 12 hours after sign-in; 8 hours; or no maximum (only the 10-minute inactivity timeout, so an open tab can keep a session alive indefinitely).
- **Recommendation:** 12 hours.
- **User decision:** 12 hours, in addition to the 10-minute inactivity timeout.
- **Decision rationale/date:** Limits the risk of a forgotten open tab. 2026-11-08.
- **Required document/evidence updates:** `01-spec.md` session criteria; `PROJECT-SETUP.md` and the auth `IDEA.md` open items.
- **Impact on completed work:** None. Refines DEC-002: an open tab keeps the session alive, up to 12 hours.

## DEC-008 — Test tooling for browser behavior

- **Raised:** 2026-11-08
- **Status:** Approved
- **Options and tradeoffs:**
  1. Keep TASK-002 tools: API tested over real HTTP against real PostgreSQL (including cookie headers), web component tests, and a manual browser checklist for multi-tab, refresh, and real cookie handling.
  2. Add Playwright for automated real-browser tests. Stronger evidence; adds a browser download locally and in CI.
- **Recommendation:** Option 1.
- **User decision:** Option 1.
- **Decision rationale/date:** Consistent with TASK-002 (DEC-003 there); lighter setup. 2026-11-08.
- **Required document/evidence updates:** `01-spec.md` test strategy and manual checklist.
- **Impact on completed work:** None.

## DEC-009 — AC-19 idle-timeout manual check

- **Raised:** 2026-11-08 (task review rounds 1 and 2)
- **Status:** Approved
- **Discovery and evidence:** The user ran the AC-19 manual browser checklist in Chrome; 8 of 9 items passed. Item 7 (with a shortened idle timeout, a closed tab's session ends) was skipped. The behavior has automated evidence: the AC-6 boundary tests (10 minutes rejected, activity extends) and the AC-9 sweep tests (idle sessions ended within 60 seconds, cleanup retried).
- **Affected scope/criteria/files:** AC-19.
- **Options and tradeoffs:**
  1. Run item 7 (about 5 minutes, with a temporary `.env` change) for real-browser evidence.
  2. Accept the automated evidence for this item. Real browser timer and close behavior is not observed manually.
- **Recommendation:** Either is reasonable; the logic is fully tested with a controllable clock.
- **User decision:** Option 2: accept the automated evidence.
- **Decision rationale/date:** 2026-11-08.
- **Required document/evidence updates:** `03-implementation-notes.md` AC-19 row; closeout records AC-19 as met with this accepted gap.
- **Impact on completed work:** None.
