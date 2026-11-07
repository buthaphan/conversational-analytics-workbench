---
name: task-review
description: Independently review a Conversational Analytics Workbench task's final diff against its approved spec, acceptance criteria, tests, security decisions, and implementation evidence. Report findings; do not make fixes or approve scope changes.
disable-model-invocation: true
---

# Independent task review

## Read

Read the latest approved `01-spec.md`, implementation plan, diff, `03-implementation-notes.md`, optional simplicity review, decision log, and relevant project/security references. Inspect the current branch and diff read-only. Do not rely solely on implementation notes.

## Check

- Correctness, edge/failure cases, regressions, and alignment with each acceptance criterion.
- Whether tests prove meaningful behavior, follow the plan, and were not weakened/deleted to obtain a pass.
- Security/privacy, authorization, validation, secrets, logging, dependency, and data-handling changes relevant to scope.
- Simplicity refactors preserve behavior and have appropriate evidence.
- Verification claims match the recorded outputs; do not infer unrun checks passed.

## Report

Create `05-task-review.md`. Report actionable findings by severity and location. Mark each criterion `met`, `unmet`, or `unverified` with evidence. Distinguish blocking defects from suggestions. If a requirement itself appears infeasible/ambiguous, use the decision process; do not silently rewrite it.

Recommend return to implementation, pending user decision, or closeout. Do not edit code, tests, specs, or approve the task yourself.

