---
name: spec-driven
description: Define and plan an approved Conversational Analytics Workbench task after its idea is recorded, committed on the base branch, and the user has created the feature branch. Produce measurable acceptance criteria, Definition of Done, test plan, and implementation plan. Do not implement.
disable-model-invocation: true
---

# Spec-driven development

## Entry gate

Before writing task documents:

1. Read `CLAUDE.md` and `docs/AGENTIC-WORKFLOW.md`.
2. Read the committed idea/function-review records and relevant project, design, architecture, and security decisions.
3. Inspect Git status and current branch using read-only commands. If the tree is dirty or branch is not the expected `feature/TASK-###-short-name`, stop. The user must create the branch. Never stage, commit, push, or switch branches.
4. Confirm `docs/work/active/TASK-###-short-name/00-context.md` points to the canonical idea record. Create/update the concise context only after the branch gate passes.

## Specification

Create `01-spec.md` from the template if present. Include problem/user, goal, in/out scope, assumptions, dependencies, measurable acceptance criteria, relevant security/privacy/accessibility/operational concerns, test strategy, Definition of Done, and open decisions.

Recommendations are not decisions. For consequential unknowns, explain options and tradeoffs and ask the user. If requirements conflict, record a pending change in `DECISION-LOG.md` and pause dependent work.

## Test plan ownership

You own the test strategy and plan. Map each acceptance criterion to appropriate test levels and important cases, including meaningful failure and boundary cases. State evidence required without prescribing brittle implementation details unless a contract requires them.

## Implementation plan

Create `02-implementation-plan.md` with small ordered steps, dependencies, criteria mapping, and a test-first sequence. Avoid duplicating full spec content.

## Approval gate

Present the spec and plan to the user. Do not begin implementation until the user approves the spec. If the user requests changes, update revision history and re-present the affected spec and plan. No code changes in this stage.

