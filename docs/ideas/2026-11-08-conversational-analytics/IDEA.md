# Idea: Conversational Analytics Workbench

## Decision

- **Status:** proposal; not yet accepted for specification. Planned as TASK-003, after TASK-002 (design system) and TASK-001 (user accounts).

## Problem

People often know the business question they want answered but do not know the data model, report, or query needed to answer it. Repeatedly fetching data for each refinement also adds friction and cost, while unbounded AI-generated queries are difficult to validate and explain.

## Intended outcome

Create a portfolio showcase where a user asks business questions in plain language, receives a clear chart or table backed by a bounded data capability, and can refine the same result set through follow-up questions. If a question requires another data scope, explain what will change and ask before fetching it.

## Intended users and context

- Showcase users; this is initially a personal portfolio project.
- All users have the same ordinary-user access. There is no administrator role.
- Initial source is the public TheLook e-commerce sample dataset.
- The application is not for any employer and must contain no employer or customer information.

## Proposed experience

- One-page analytics workspace: visual result area above a question composer. Sign-in is included in the first local end-to-end slice; voice input remains open. No admin page or admin role.
- AI interprets intent, selects one of the approved capabilities, asks targeted clarification when required, and recommends a chart type.
- Application code validates the chosen capability and parameters. The data layer calculates and returns results; model output never becomes executable SQL.
- The active result set is stored in PostgreSQL, scoped to the user and authentication session, and survives page refresh. One session per user; signing in elsewhere ends the previous one.
- Before replacing the result set with a new data scope, the assistant explains the change and asks whether to proceed.
- Users can request another visualization, such as a pie chart, and the view changes while retaining the same data where appropriate.
- When the session ends (logout, closing the app without signing out, inactivity expiry, or a new sign-in elsewhere), delete the associated analysis session, questions, and result data. Logging in again starts fresh. Saving/reopening old sessions is future scope.

## Initial data capability direction

The ten capability contracts and their descriptions are in `../../product/AI-DATA-CAPABILITIES.md`. They should be broad enough to support multiple user questions through validated parameters, not one procedure per phrasing or ranking variation.

## Constraints

- Use the public sample dataset; avoid production data and credentials.
- Keep the AI on a constrained intent/parameter/visualization path; do not allow arbitrary SQL generation/execution.
- Show evidence and exact values alongside visualizations.
- Use the project workflow and require a user-created branch before writing a task specification.

## Open questions

- How are ordinary user accounts created and how does temporary showcase access expire?
- What BigQuery access pattern, quotas, and caching strategy should the first milestone use?
- Which Bedrock model and what bounded context will be sent to it?
- What maximum result-set size is safe, and what should happen when the complete result exceeds it?
- What does the first end-to-end milestone include, and what is explicitly deferred?
- Which AWS services will be used for a manual showcase, and what spend controls apply?


