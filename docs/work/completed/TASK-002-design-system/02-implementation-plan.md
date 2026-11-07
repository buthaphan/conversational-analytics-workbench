# Implementation plan: TASK-002 Design system

**Spec revision:** 1 (approved 2026-11-08)  
**Status:** Approved for implementation

| Step | Behavior / change | Acceptance criteria | Test-first step | Dependencies |
|---|---|---|---|---|
| 1 | Ask the user to approve the installs. Create the root npm workspace, the `web/` Vite React TypeScript app, `.nvmrc`, and Vitest with the simulated DOM. | AC-1 | A smoke test that renders the app shell fails before the shell exists, then passes | User approval for installs |
| 2 | Add ESLint, Prettier, and TypeScript checks with root scripts `format:check`, `lint`, `typecheck`, `test`, `build`. | AC-1 | Run each script; fix until all exit 0 | 1 |
| 3 | WCAG contrast-ratio helper. | AC-3 | Known-value tests (21:1; `#777777` on white fails 4.5:1) red, then green | 1 |
| 4 | Color token source with role tokens and brand tokens; CSS custom properties; Tailwind theme mapping; declared pairings list. | AC-2, AC-3 | Required-roles test and pairings test red on missing or placeholder values, then green with tuned values | 3 |
| 5 | Raw color literal guard for component sources. | AC-6 | Guard fails on a deliberate literal in a fixture, passes on clean sources | 4 |
| 6 | Inter font (self-hosted), fallback stack, type scale, tabular figures style; spacing, radius, shadow, border, and breakpoint tokens. | AC-4, AC-5 | Build check for external font/CSS URLs written first and run against the build | 4 |
| 7 | Button. | AC-7 | Variant, focus, disabled, loading (`aria-busy`, no repeat activation), and axe tests red, then green | 4, 5 |
| 8 | Input and FormField. | AC-7 | Label association, description, error wiring, required-in-text, and axe tests red, then green | 4, 5 |
| 9 | Alert, Card, Spinner. | AC-7 | Role per variant, non-color label, reduced motion, and axe tests red, then green | 4, 5 |
| 10 | Table. | AC-7, AC-4 | Caption, header scope, numeric alignment and tabular figures, and axe tests red, then green | 6 |
| 11 | Chart palettes. | AC-8 | Palette tests (3:1, ΔE under normal and simulated deficiencies, monotonic, neutral midpoint) red, then green. If infeasible, raise a change request. | 3, 4 |
| 12 | ECharts theme and chart wrapper with an accessible table. | AC-8 | Theme reads tokens; wrapper table equals data, including empty data (ECharts mocked) | 10, 11 |
| 13 | Development-only reference page. | AC-10 | Build check that the marker is absent from `web/dist`, red before gating, then green | 7–12 |
| 14 | CI workflow. | AC-11 | Inspection against the spec checklist; the local scripts already green | 2 |
| 15 | Update `DESIGN-SYSTEM.md`. | AC-12 | Inspection against the AC-12 list | 4–13 |
| 16 | Manual accessibility checklist and user review of the reference page. | AC-9, AC-13 | Not test-first; checklist and approval recorded | 13 |

## Verification sequence

1. During each red/green cycle: run only the focused test file for the step.
2. After step 15: run once from a clean install, recording output: `npm ci`, `format:check`, `lint`, `typecheck`, `test`, `build`, plus the build checks. Then run `npm audit` (needs network; ask first).
3. Step 16 with the user; then hand off to `/task-review`.

## Risks / coordination

- **`echarts-for-react` and React compatibility:** check at step 1. If incompatible, pause and raise a decision.
- **Palette thresholds (AC-8)** may need a change request; do not weaken tests silently.
- **ECharts in the simulated DOM** has no real layout or canvas. Test the theme and the wrapper's table, not rendered pixels; visual correctness is covered by AC-13.
- **TASK-001 handover:** TASK-001 must be updated to use `web/` and these components, and to add `api/` and Docker Compose. That update happens on its branch when it resumes.
