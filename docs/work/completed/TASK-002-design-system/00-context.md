# Task context: TASK-002 Design system

**Branch:** `feature/TASK-002-design-system`  
**Idea record:** [IDEA.md](../../../ideas/2026-11-08-design-system/IDEA.md), [FUNCTION-REVIEW.md](../../../ideas/2026-11-08-design-system/FUNCTION-REVIEW.md) (committed on `main` in `d501e13`)  
**Status:** Spec revision 1 and plan approved 2026-11-08; ready for implementation

## Accepted intent

Define and implement an approved, accessible design system before any feature UI, so later tasks consume tokens and components instead of inventing styling. Deliver documentation and code: a minimal web app skeleton, role-named light-mode tokens, a chart palette and ECharts theme, starter components, and a reference page used for approval. The idea record remains canonical.

## Relevant approved decisions

- Deliverable is docs and code with a minimal web skeleton (React, Vite, TypeScript, Tailwind CSS, shadcn-style components); this moves the web part of the foundation from TASK-001 into this task. ([IDEA.md](../../../ideas/2026-11-08-design-system/IDEA.md#decision))
- Light mode now; tokens named by role so dark mode can be added later without rework.
- Brand anchors navy `#18324B`, teal `#14A38B`, gold `#E5A93D`, and logo SVGs in `assets/brand/` are accents, not the full palette. ([DESIGN-SYSTEM.md](../../../design/DESIGN-SYSTEM.md))
- Charts: Apache ECharts via `echarts-for-react`; color-blind-aware palette; no meaning by color alone; exact values in tooltips and an accessible table view. ([PROJECT-SETUP.md](../../../PROJECT-SETUP.md#design))
- Task order: TASK-002 runs first; TASK-001 (accounts, API, PostgreSQL, Docker Compose) resumes after it is approved. ([PROJECT-SETUP.md](../../../PROJECT-SETUP.md#decisions-recorded-2026-11-08))
- During an approved implementation, ordinary local test runs are authorized; installs, network use, and external services need approval.

## Constraints and dependencies

- Every npm install, including the shadcn CLI via `npx`, requires user approval (network).
- No third-party font CDN without an explicit decision (visitor privacy); prefer system or self-hosted fonts.
- No sign-in behavior, API, database, data, or AI work; no admin screens.
- No secrets; `.env.example` placeholders only if any configuration is needed.

## Open questions for the spec stage

From [FUNCTION-REVIEW.md](../../../ideas/2026-11-08-design-system/FUNCTION-REVIEW.md#open-decisions):

- Font: system stack or self-hosted family.
- Contrast target: WCAG 2.2 AA (recommended) or AAA.
- Minimum supported width and breakpoint set.
- Starter component list.
- Whether web CI (lint, type check, tests, build) starts here (recommended) or in TASK-001.
- Web container and Docker Compose here or in TASK-001 (recommended: TASK-001).
- Accessibility and test tooling.
- Package manager and repository layout (for example `web/`, ready for `api/`).

## Next action

Run `/implementation` against [01-spec.md](01-spec.md) revision 1 and [02-implementation-plan.md](02-implementation-plan.md), starting with step 1 (install approval).
