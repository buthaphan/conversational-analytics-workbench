# Decision log: TASK-002 Design system

Record only material decisions or change requests. Keep pending questions visible and pause dependent work until the user decides.

## DEC-001 — Typeface

- **Raised:** 2026-11-08
- **Status:** Approved
- **Options and tradeoffs:**
  1. Self-hosted Inter (`@fontsource-variable/inter`): consistent across operating systems, tabular figures, one dependency, no CDN.
  2. System font stack: no install, but the look varies by device.
  3. Self-hosted IBM Plex Sans: more technical character, one dependency.
- **Recommendation:** Option 1.
- **User decision:** Self-hosted Inter.
- **Decision rationale/date:** Consistent review and screenshots; no third-party font requests. 2026-11-08.
- **Required document/evidence updates:** `01-spec.md` AC-4.
- **Impact on completed work:** None.

## DEC-002 — Repository layout and package manager

- **Raised:** 2026-11-08
- **Status:** Approved
- **Options and tradeoffs:**
  1. npm workspaces with the app in `web/`; TASK-001 adds `api/`. No extra tool.
  2. pnpm workspaces in `web/`: faster, stricter; needs pnpm locally and in CI.
  3. Single app at the repository root: simplest now, restructure later.
- **Recommendation:** Option 1.
- **User decision:** npm workspaces, `web/`.
- **Decision rationale/date:** Ready for the API without an extra tool. 2026-11-08.
- **Required document/evidence updates:** `01-spec.md` AC-1, AC-11.
- **Impact on completed work:** None.

## DEC-003 — Test tooling

- **Raised:** 2026-11-08
- **Status:** Approved
- **Options and tradeoffs:**
  1. Vitest, React Testing Library, and axe in a simulated DOM. No browser download; layout, reflow, and visual checks are manual.
  2. Add Playwright for real-browser accessibility, keyboard, reflow, and screenshot evidence. Browser binaries locally and in CI.
- **Recommendation:** Option 1.
- **User decision:** Vitest, React Testing Library, and axe.
- **Decision rationale/date:** Lighter setup; visual approval is the user's review of the reference page. 2026-11-08.
- **Required document/evidence updates:** `01-spec.md` test strategy; AC-9 is verified manually.
- **Impact on completed work:** None.
