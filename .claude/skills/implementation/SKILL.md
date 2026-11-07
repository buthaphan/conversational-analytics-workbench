---
name: implementation
description: Implement an approved Conversational Analytics Workbench task on its verified feature branch using the approved spec and plan. Follow Red-Green-Refactor, write tests before behavior code, and record evidence. Do not change scope or perform Git/AWS publication actions.
disable-model-invocation: true
---

# Implementation

## Read first

Read `CLAUDE.md`, `docs/AGENTIC-WORKFLOW.md`, the task's `00-context.md`, latest user-approved `01-spec.md`, `02-implementation-plan.md`, and `DECISION-LOG.md` if it exists. Read only relevant shared design/security/architecture references.

Verify with read-only Git inspection that the working tree is on the expected feature branch and clean before work. If not, stop and ask the user to resolve it. Confirm the spec is approved and no decision is pending.

## Work cycle

For each behavior:

1. Write the smallest test that captures an approved criterion.
2. Run it and record the expected failure and reason.
3. Implement the smallest production change that makes it pass.
4. Refactor while keeping the relevant tests green.
5. Map the evidence to acceptance criteria.

Do not weaken/remove a test to make implementation pass. Diagnose failures against the approved requirement first. If the requirement seems ambiguous, infeasible, unsafe, or contradictory, stop dependent work and use the decision-log process.

## Scope and safety

- Do not add dependencies, services, architecture, or behavior outside the approved plan without asking.
- Follow security/privacy and design references. Never read or echo secrets; keep them out of source, fixtures, logs, screenshots, and prompts.
- Do not run `git add`, `git commit`, `git push`, branch-changing commands, AWS, or deployment commands. The project settings deny common forms; do not seek alternate ways to perform them.
- Ask before dependency installation, external service access, security-control changes, or commands with external side effects.

## Evidence and handoff

Create/update `03-implementation-notes.md` with changed files, test-first evidence, commands/results, criterion mapping, limitations, blockers, and brief simplicity check. Run focused tests during cycles and the broader agreed verification once after implementation. Do not claim unrun checks pass.

If a meaningful complexity/cohesion/duplication/coupling concern exists, flag it for `/code-simplicity`; otherwise hand off directly to `/task-review`. Do not claim completion or self-approve the work.

