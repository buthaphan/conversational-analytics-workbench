# Idea: Design system

**Captured:** 2026-11-08 (project local date)  
**Status:** Accepted for specification  
**Proposed task ID:** TASK-002 (runs before TASK-001 resumes)  
**Proposed branch:** `feature/TASK-002-design-system`

## Decision

- **Status:** accepted for specification
- **Decision date:** 2026-11-08
- **Chosen scope:** as in [FUNCTION-REVIEW.md](FUNCTION-REVIEW.md#candidate-scope): minimal web skeleton (React, Vite, TypeScript, Tailwind), role-named light-mode tokens (dark-ready), typography, spacing, radius, breakpoints, chart palette and ECharts theme, starter base components with states, a reference page for approval, and automated contrast checks. Remaining choices are settled in the spec.
- **Proposed task/branch:** TASK-002, `feature/TASK-002-design-system`

## In the user's words/context

While specifying TASK-001 (user accounts and sign-in), the user chose to define the design system before building any UI, so that the app is consistent from the first screen ([TASK-001 DEC-001](../../work/completed/TASK-001-user-accounts/DECISION-LOG.md)). [DESIGN-SYSTEM.md](../../design/DESIGN-SYSTEM.md) already records the direction and says detailed tokens must be approved before UI implementation.

## Intended outcome

An approved, documented design system that later tasks build on without inventing styling: the sign-in screen and signed-in shell in TASK-001, then the analytics workspace, charts, and tables.

## Initial constraints

- Brand anchors: deep navy `#18324B`, teal `#14A38B`, warm gold `#E5A93D`; logo assets in `assets/brand/`. These are accents, not the full palette.
- Approved stack: React with Vite, Tailwind CSS, shadcn-style components, Apache ECharts via `echarts-for-react`.
- Calm, professional analytics interface; keyboard support, responsive layouts, readable contrast (WCAG AA as the expected baseline, to confirm).
- Chart colors must be color-blind aware and must not rely on color alone; exact values in tooltips plus an accessible table view.
- Clear loading, empty, clarification, error, and success states.
- No admin screens.
- Dependency installs, font downloads, or other network use need user approval.

## User choices (2026-11-08, during function review)

- Deliverable: documentation **and** code, including a minimal web app skeleton (React, Vite, Tailwind), a token theme, base components, an ECharts theme, and a reference page. This moves the web part of the foundation from TASK-001 into this task.
- Light mode now; tokens named by role so dark mode can be added later without rework.

## Unknowns

- Typography: font family (self-hosted or system fonts), type scale.
- Spacing, radius, shadow, and border tokens.
- Semantic color roles (surface, text, border, focus, success, warning, error) and contrast targets.
- Chart palette: categorical, sequential, and diverging series colors; how the brand colors fit.
- Responsive breakpoints and the minimum supported width.
- Component conventions: which shadcn-style components are adopted first (button, input, form field, alert, card, table, dialog) and how states are shown.
- How approval is evidenced (for example, a reference page or screenshots reviewed by the user).

## Explicit exclusions

- Analytics workspace features, sign-in behavior, and any data or AI integration.
- Marketing site or branding changes beyond the selected logo.
