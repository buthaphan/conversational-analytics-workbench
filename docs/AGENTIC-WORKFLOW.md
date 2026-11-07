# Idea-to-delivery workflow

This workflow keeps each stage's inputs and outputs visible, prevents unapproved scope changes, and gives the next stage a concise handoff. Customize the gates only by recording an explicit project decision.

## Stages and handoffs

| Stage | Owner | Output | Purpose / next handoff |
|---|---|---|---|
| 0. Idea capture | User + Claude | `docs/ideas/YYYY-MM-DD-short-description/IDEA.md` | Record the problem, intended outcome, context, constraints, and open questions. |
| 1. Function review | `/function-review` | Same folder: `FUNCTION-REVIEW.md` | Assess user/value, scope, risks, dependencies, open decisions, recommendation, and candidate task/branch. This is not a build spec. |
| Gate: commit and branch | User | Idea record committed on base branch; user-created feature branch | Preserve the idea record and isolate task work before specification. |
| 2. Specify | `/spec-driven` | Task `01-spec.md` | Define goal, users, boundaries, measurable acceptance criteria, Definition of Done, risks, and test plan. User approves before implementation. |
| 3. Plan | `/spec-driven` | Task `02-implementation-plan.md` | Order the work and map implementation/test steps to acceptance criteria. |
| 4. Implement | `/implementation` | Code/tests and `03-implementation-notes.md` | Implement against approved scope; record test-first steps, results, deviations, and evidence. |
| 5. Simplicity review | `/code-simplicity`, only when warranted | Optional `04-simplicity-review.md` | Address meaningful complexity, coupling, duplication, or cohesion concerns without changing behavior or scope. |
| 6. Task review | `/task-review` | `05-task-review.md` | Independently assess the diff, tests, security-relevant changes, and each acceptance criterion. |
| 7. Closeout | User + Claude | `06-closeout.md` | Record DoD status, review resolution, verification, known limitations, pending decisions, and release/CI state. User accepts completion. |
| 8. Opportunity review | `/opportunity-review`, when useful | Optional `07-opportunity-review.md` | Record worthwhile follow-up ideas after meaningful work. |

Use the available named skills if installed. If unavailable, perform the stage explicitly and preserve the same handoff artifact rather than pretending a skill ran.

## Idea records

- Store an idea and its function review together in one dated folder under `docs/ideas/`.
- Ideas can remain unbuilt. Do not create task specs or implementation plans during idea capture/function review.
- Use a short, descriptive kebab-case folder name. Use the project's local date and avoid overwriting an existing idea folder.
- Keep proposals, decisions, assumptions, and unknowns clearly labeled.

## Mandatory branch-before-spec gate

1. When the user chooses an idea to progress, record the decision in that idea folder's `IDEA.md`: status `accepted for specification`, decision date, chosen scope, and the proposed task/branch. This records intent but does not bypass the commit-and-branch gate. Then inspect Git status read-only.
2. If the idea record is uncommitted, ask the user to commit it on the base branch. Wait for confirmation; do not stage or commit on the user's behalf unless the project agreement explicitly authorizes that action.
3. The user creates the local feature branch using the proposed task ID/name. Claude verifies the active branch and clean working tree with read-only inspection.
4. If the branch is wrong, the tree is dirty, or other changes could move with the branch, stop and explain what needs attention. Do not switch branches, stash, discard, or move changes automatically.
5. After verification, create `docs/work/active/TASK-###-short-name/00-context.md`, linking to the committed idea record and summarizing only the relevant decisions.
6. Start `/spec-driven` on that branch. Do not write task-specific specs on the base branch.

The user controls remote publication (push/PR/merge) according to the project's working agreement.

## Task documents

```text
docs/
  ideas/YYYY-MM-DD-short-description/
    IDEA.md
    FUNCTION-REVIEW.md
  product/                         # optional project-level product references
  architecture/                    # optional architecture decisions/ADRs
  design/                          # optional design system
  security/                        # optional security baseline
  work/
    active/TASK-###-short-name/
      00-context.md
      01-spec.md
      02-implementation-plan.md
      03-implementation-notes.md
      04-simplicity-review.md       # only if triggered
      05-task-review.md
      06-closeout.md
      07-opportunity-review.md      # only when useful
      DECISION-LOG.md               # only when needed
    completed/
  templates/
```

Create artifacts as they become relevant. Do not create empty placeholders. Move accepted, completed task folders from `active/` to `completed/` according to the project's version-control conventions.

## Specification and Definition of Done

`/spec-driven` owns the test plan and defines measurable acceptance criteria and the Definition of Done. A useful spec includes:

- User/problem and intended outcome.
- In-scope and explicitly out-of-scope behavior.
- Assumptions and dependencies.
- Measurable acceptance criteria.
- Security, privacy, accessibility, operational, and failure considerations relevant to the feature.
- Test levels/cases and evidence required for each criterion.
- Definition of Done and unresolved decisions.

The user approves the spec before implementation starts. Do not let implementation silently redefine the criteria.

## Test-driven implementation

- `/implementation` writes a test for the next behavior, runs it and confirms the expected failure, implements the smallest change that satisfies it, then refactors while keeping tests green.
- If a meaningful red phase cannot be demonstrated, explain why rather than claiming TDD was followed.
- Record focused checks during the red/green cycles and the broader verification once after implementation. Avoid repeated full runs without changed code or missing evidence.
- Review simplicity as part of implementation. Invoke a dedicated simplicity stage only when a meaningful maintainability concern exists; file length is a signal for inspection, not an automatic split rule.
- Do not weaken or remove tests merely to make implementation pass. A spec/test change that alters expected behavior requires the change-request process and user approval.

## Change requests and decision log

Any stage may discover ambiguity, contradiction, infeasibility, failure, or a new constraint. Diagnose first. A failing test against a clear requirement normally means fix the implementation.

When a material requirement or decision may need to change:

1. Pause work that depends on the decision.
2. Create/update the task's `DECISION-LOG.md`: ID, date, discovery, affected criteria/files, options, recommendation/rationale, tradeoffs/risks, and status `Pending user decision`.
3. Ask the user with a concise recommendation. Do not proceed down a dependent path while awaiting the answer.
4. Record the user's choice, rationale, and date. Update the spec, DoD, plan, tests, implementation notes, or other affected artifacts.
5. Mark obsolete work/evidence clearly and obtain approval of the revised spec before resuming implementation.

Later stages read the latest approved artifacts and decision log. Do not silently change scope, requirements, architecture, security posture, or accepted behavior.

## Review and closeout

- Task review maps every acceptance criterion to `met`, `unmet`, or `unverified` and cites evidence. It reviews tests and relevant security changes.
- Resolve blocking findings and rerun only checks affected by changes or lacking trustworthy evidence.
- Closeout records user acceptance and known limitations. If external CI/release confirmation has not happened, say so plainly; do not claim it has.
- For meaningful work, opportunity review may recommend follow-ups. Recommendations do not authorize new work.
- Keep a brief workflow retrospective only when there was actionable friction. After several completed features, review repeated friction before changing the process.

## Efficient stage context

Read only the active stage's canonical inputs and relevant shared references. Prefer concise handoffs and links over pasting earlier documents or rereading full chat history. If an input is missing or contradictory, identify the gap before proceeding.

