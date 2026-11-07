# Function review: Conversational Analytics Workbench

**Status:** Recommended; not yet accepted for specification  
**Proposed task ID:** TASK-002 (provisional; follows TASK-001 user accounts)  
**Proposed branch:** `feature/TASK-002-customer-spending`

## Summary

A natural-language analytics workbench can demonstrate practical agentic AI while keeping data access deterministic and reviewable. The user interacts conversationally, but approved server-side capabilities own the actual data retrieval and calculation.

## Candidate first task

The repository, Docker Compose, and CI foundation is part of TASK-001 (user accounts; see `../2026-11-08-user-authentication/`). The first analytics task should be a `customer_spending` slice on top of that, because it demonstrates ranking in both directions and follow-up reuse of one active result set. This is a proposal only; confirm the task when you accept this idea for specification.

## Value and fit

- Demonstrates AI tool/capability selection, ambiguity handling, typed validation, and stateful follow-up behavior.
- Demonstrates modern full-stack engineering: React, TypeScript, Node API, PostgreSQL, BigQuery, charting, Docker, tests, and CI.
- The controlled capability registry is a strong portfolio differentiator: the model chooses from clear descriptions rather than inventing SQL.
- The user can explain decisions and show the evidence behind a visualization.

## Scope recommendation

Keep the initial project focused on one dataset and one primary workspace. Prove a thin vertical path before expanding all ten capabilities: one signed-in ordinary user asks a question, the model returns a validated capability selection, server code fetches/calculates bounded data, the UI renders a chart and exact values, and a related follow-up reuses that result set. Include sign-in/sign-out in this first local end-to-end path; add clarification and explicit data-scope switching as defined behavior. Expand to the complete capability catalogue in staged tasks.

This is a sequencing recommendation only; task breakdown and first milestone Definition of Done belong in the specification stage.

## Data and AI contract

- Maintain a catalogue of ten broad capabilities with descriptions, required/optional parameters, allowed values, result schemas, and examples of similar questions.
- AI may select a capability, extract/ask for parameters, and choose a display suggestion.
- API validates every capability ID and parameter. Database/query code performs calculations and enforces the safe result-set size and time limits; a capability's display `limit` applies to the stored result, not to retrieval.
- AI must clarify when intent or required parameters remain ambiguous.
- Keep an explicit active result-set descriptor for the session. Reuse it for compatible follow-ups. Ask before replacing it when a new capability or incompatible scope is required.
- Render numeric evidence and source/scope metadata. Chart choice does not change the underlying result set.
- No arbitrary model-generated SQL and no promise that the model's first choice is always correct.

See `../../product/AI-DATA-CAPABILITIES.md` for capability contracts.

## Risks and mitigations

- **Wrong capability selection:** use rich descriptions, overlapping examples, typed schemas, validation, clarification behavior, and evaluation cases.
- **Broad/ambiguous questions:** ask concise follow-up questions before execution when the requested metric, time range, or threshold is missing.
- **Dataset mismatch:** keep examples and UI labels faithful to TheLook data semantics; show scope and caveats.
- **Cost/latency:** bound result size and model context, reuse session results, set budgets/quotas, and avoid hidden repeat calls.
- **Privacy:** use public sample data, minimize data sent to the model, and avoid collecting unnecessary user information.
- **Auth/account lifecycle:** include sign-in in the first local end-to-end slice, with no admin role or UI. Ordinary-account provisioning and account expiry remain open.
- **Visual overclaim:** pair charts with exact values and a table/evidence view; don't imply prediction or causality unless the data supports it.

## Dependencies and decisions

- Current stack direction and open choices: `../../PROJECT-SETUP.md`.
- Depends on TASK-001 (user accounts and sign-in). Session rules are agreed there: one session per user, refresh keeps it, and analysis data is deleted when the session ends.
- AWS services and spend controls remain open and must be decided before cloud deployment work.

## Recommendation

Keep this idea as the project baseline and progress it after TASK-001. Do not write a task spec or implement app code on the base branch. When the user accepts this idea, record the decision in `IDEA.md`, commit it on the base branch, and have the user create the feature branch; only then does `/spec-driven` define acceptance criteria, test plan, and Definition of Done.


