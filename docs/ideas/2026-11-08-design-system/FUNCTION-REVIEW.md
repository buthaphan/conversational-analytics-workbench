# Function review: Design system

**Status:** Accepted for specification on 2026-11-08 (see `IDEA.md` decision)  
**Proposed task ID:** TASK-002 (runs before TASK-001 resumes)  
**Proposed branch:** `feature/TASK-002-design-system`

## User and problem

Every later screen needs styling: the sign-in screen and shell in TASK-001, then the analytics workspace, charts, and tables. [DESIGN-SYSTEM.md](../../design/DESIGN-SYSTEM.md) gives only a direction and brand colors, and says tokens must be approved before UI patterns are added. Without an approved system, each task would invent its own styling and the portfolio would look inconsistent.

## Value and outcome

- A consistent, accessible look from the first screen, which matters for a portfolio showcase.
- Later tasks consume approved tokens and components instead of making design decisions mid-implementation.
- Accessibility (contrast, focus, keyboard, color-blind-safe charts) is designed and checked once, not retrofitted.
- Observable outcome: a reference page in the real stack that you review and approve, backed by automated contrast checks.

## Candidate scope

User choices on 2026-11-08: deliver docs **and** code with a minimal web skeleton; design light mode now, with role-named tokens so dark mode can be added later without rework.

- Minimal web app skeleton: React, Vite, TypeScript, Tailwind CSS, per the [approved stack](../../PROJECT-SETUP.md#engineering-decisions). This moves the web part of the foundation from TASK-001 into TASK-002.
- Updated `DESIGN-SYSTEM.md` recording the approved decisions.
- Color tokens named by role (surface, text, border, primary, focus, success, warning, error, info), built from the brand anchors, as CSS variables wired into the Tailwind theme.
- Typography (family and scale), spacing, radius, shadow, and border tokens.
- Responsive breakpoints and minimum supported width.
- Chart palette (categorical, sequential, diverging) and an ECharts theme, color-blind aware and not relying on color alone.
- A small set of shadcn-style base components needed by TASK-001 and the workspace (for example button, input, form field with error, alert, card, table), showing default, hover, focus, disabled, loading, and error states.
- A reference page showing tokens, components, states, and a sample chart with an accessible table, used as the approval surface.
- Automated checks: contrast ratios for token pairs, and component and accessibility tests.

## Exclusions

- Sign-in behavior, API, database, sessions (TASK-001).
- Analytics workspace, data, and AI integration (TASK-003 onward).
- Designing or verifying dark mode (tokens only stay dark-ready).
- Marketing pages or logo changes.

## Risks and dependencies

- **Scope moves between tasks:** the web skeleton now lands in TASK-002, so TASK-001's context and spec must be updated on its branch when it resumes.
- **Network and installs:** Vite, Tailwind, React, ECharts, and the shadcn CLI (`npx`) need npm downloads; each install needs user approval. Font choice may add one more.
- **Font privacy:** loading fonts from a third-party CDN sends visitor requests to that provider. Prefer system fonts or self-hosted fonts.
- **Subjective approval:** "looks right" is hard to test. Pair the reference page with your explicit approval and automated contrast and accessibility checks.
- **Chart accessibility:** brand colors alone are not a safe series palette; the palette needs a color-vision-deficiency check and non-color cues such as labels, patterns, or direct values.
- **Over-building:** keep to the components the next two tasks need, not a full library.

## Open decisions

For the specification stage unless you decide now:

- Font: system font stack or a self-hosted family.
- Contrast target: WCAG 2.2 AA (recommended) or AAA for text.
- Minimum supported width and breakpoint set.
- Exact starter component list.
- Whether GitHub Actions CI for the web app (lint, type check, tests, build) starts in this task or stays in TASK-001. Recommendation: start it here, since this task creates the first code.
- Whether a web container and Docker Compose start here or in TASK-001. Recommendation: TASK-001, when the API and database arrive.
- Accessibility test tooling (for example axe-based checks); a dependency choice needing approval.
- Package manager and repository layout (for example a `web/` folder ready for `api/` later).

## Recommendation

Proceed to specification as TASK-002. The scope is clear, it unblocks TASK-001, and the user's two choices bound its size. Settle the open decisions above in the spec. This review is a recommendation, not a specification or authorization to build.
