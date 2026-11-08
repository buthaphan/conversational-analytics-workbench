# Idea: Conversational Analytics Workbench

## Decision

- **Status:** accepted for specification
- **Decision date:** 2026-11-08
- **Chosen scope:** as in [ARCHITECTURE-PROPOSAL.md](ARCHITECTURE-PROPOSAL.md) (revision 5), delivered in two tasks:
  - **TASK-003, core conversational workflow without credentials:** turn interpretation with an explicit relevance assessment, backend enforcement of retrieval, clarification, switching, and explanation, the three data layers, three analytical operations, bar and table views, the chat interface, and session-scoped storage, using fake data and AI adapters. Capabilities: `customer_spending` and `product_sales_performance`.
  - **TASK-004, real adapters:** TheLook profiling, BigQuery queries for the same two capabilities, the Claude Sonnet 5.5 adapter, tool-selection and relevance checks, and a real conversation.
- **Proposed tasks/branches:** TASK-003, `feature/TASK-003-conversational-workflow`; TASK-004, `feature/TASK-004-data-and-ai-adapters`
- **Approved decisions (user, 2026-11-08):**
  - **A:** BigQuery Sandbox using the public TheLook dataset.
  - **B:** Anthropic API, starting with Claude Sonnet 5.5; compare models later with the same checks. The user intends to use Claude Max API credits; confirm they apply to API (Console) usage before TASK-004.
  - **C:** The backend generates all numbers and analytical findings; the AI receives metadata and context only, never raw data rows or calculated result figures.
  - The TASK-003 / TASK-004 split.
  - Three analytical operations (summary, concentration, group by category) that run on the **complete active result set** unless the user explicitly asks about the filtered or displayed subset.
  - An explicit relevance assessment by the AI on every turn, with backend validation and enforcement.
  - A clear distinction between the complete active dataset, the filtered set, and the displayed rows.
  - Descriptive findings only; no causal explanations.
  - Any change of capability or scope needs the user's confirmation; a confirmed switch replaces the active result set, and the previous dataset is not retained.
  - PostgreSQL session-scoped storage.
  - Bar chart and table views only in the first slice; other chart types deferred.
- **Deferred:** the remaining 8 capabilities; pie and other chart types; an "explain results" feature that would send backend-computed figures to the AI; Amazon Bedrock; AWS deployment.

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

- How are ordinary user accounts created and how does temporary showcase access expire? (Open; before the AWS showcase.)
- ~~What BigQuery access pattern should the first milestone use?~~ Decided: BigQuery Sandbox with backend-owned parameterized queries (decision A). Quotas and caching are detailed in TASK-004.
- ~~Which Bedrock model and what bounded context will be sent to it?~~ Decided: Anthropic API with Claude Sonnet 5.5 (decision B), metadata and context only (decision C). Bedrock is deferred to the AWS work.
- What maximum result-set size is safe? (The rule is decided: refuse with an explanation, never silently truncate. The number is set after profiling in TASK-004.)
- ~~What does the first end-to-end milestone include?~~ Decided: TASK-003 and TASK-004 as above.
- Which AWS services will be used for a manual showcase, and what spend controls apply? (Open.)


