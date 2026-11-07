---
name: code-simplicity
description: Review an Conversational Analytics Workbench implementation for a specific meaningful maintainability concern such as poor cohesion, complexity, duplication, coupling, or an oversized file with multiple responsibilities. Refactor only when behavior can be preserved and verified.
disable-model-invocation: true
---

# Code simplicity review

## Entry

Invoke only when implementation notes identify a concrete concern. Read the approved spec and relevant criteria, `03-implementation-notes.md`, affected code/tests, project decisions, and any decision log. Confirm no pending decision blocks the work.

## Review

- Identify the concrete concern and why it makes safe changes harder.
- Treat file length as an inspection signal, not an automatic split rule; around 300 meaningful lines is a prompt to inspect cohesion.
- Prefer the smallest behavior-preserving refactor. Do not redesign architecture, change public behavior, add dependencies, or expand scope.
- If a proposed improvement changes scope/contracts or has material tradeoffs, record a pending decision and stop.
- Run relevant focused tests after refactoring and record actual results.

## Output

Create `04-simplicity-review.md` with the concern, affected files, refactor (or reason for no change), behavior-preservation evidence, checks run/results, and residual concern. Hand off to `/task-review`; the independent review must include this refactor.

