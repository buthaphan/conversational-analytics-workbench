# Task context: TASK-001 User accounts and sign-in

**Branch:** `feature/TASK-001-user-accounts` (rebased onto `main` after TASK-002 merged)  
**Idea record:** [IDEA.md](../../../ideas/2026-11-08-user-authentication/IDEA.md), [FUNCTION-REVIEW.md](../../../ideas/2026-11-08-user-authentication/FUNCTION-REVIEW.md) (committed on `main`)  
**Status:** Spec and plan approved 2026-11-08 ([01-spec.md](01-spec.md), [02-implementation-plan.md](02-implementation-plan.md)); ready for implementation. The design-system prerequisite ([DEC-001](DECISION-LOG.md#dec-001--sign-in-ui-before-the-design-system-task)) is complete: TASK-002 was accepted and merged into `main` on 2026-11-08.

## Accepted intent

An ordinary user can sign in, reach a signed-in one-page workspace shell, and sign out. Server-side sessions follow the agreed session rules. The task also adds the API, PostgreSQL, and Docker Compose foundation needed to build and test this. Analytics features are out of scope. The idea record remains canonical.

## What changed since the pause

- TASK-002 delivered the web app in `web/` (npm workspace; React, Vite, TypeScript, Tailwind), design tokens, and components that the sign-in screen and shell must use: `Button`, `FormField` + `Input`, `Alert`, `Card`, `Spinner`. See [DESIGN-SYSTEM.md](../../../design/DESIGN-SYSTEM.md) and [TASK-002 closeout](../../completed/TASK-002-design-system/06-closeout.md).
- GitHub Actions CI already runs format, lint, typecheck, test, and build for `web`. This task extends it to the API.
- The analytics slice that will rely on session-end cleanup is now planned as TASK-003 (not TASK-002).
- The web app currently shows the development-only design reference page at its root. Sign-in changes what the root shows.

## Relevant approved decisions

- One ordinary-user role; no admin role, route, or UI. ([CLAUDE.md](../../../../CLAUDE.md), [PROJECT-SETUP.md](../../../PROJECT-SETUP.md))
- Stack: TypeScript; React + Vite, Tailwind, shadcn-style components; NestJS API; PostgreSQL; Docker Compose; GitHub Actions CI with no AWS credentials or deployment. ([PROJECT-SETUP.md](../../../PROJECT-SETUP.md#engineering-decisions))
- Local account: a seed creates `user@example.test` with a known weak development password, for local development and tests only. It is never created in the AWS showcase or any internet-reachable environment, and only the password hash is stored. ([IDEA.md](../../../ideas/2026-11-08-user-authentication/IDEA.md#decision))
- One authentication session per user; a new sign-in ends the previous session.
- A page refresh keeps the same session.
- Closing the app without signing out counts as signing out, enforced by a 10-minute server-side inactivity timeout. Any open tab keeps the session alive ([DEC-002](DECISION-LOG.md#dec-002--session-keep-alive)).
- When a session ends for any reason, its analysis data is deleted. This task has no analysis data yet; it must provide the session-end cleanup point TASK-003 relies on.
- Password hashing: Node built-in `crypto.scrypt` ([DEC-003](DECISION-LOG.md#dec-003--password-hashing)).
- Database tooling: Prisma ([DEC-004](DECISION-LOG.md#dec-004--database-tooling)).
- During an approved implementation, ordinary local test runs are authorized; installs, network use, and external services need approval.

## Constraints and dependencies

- Build authentication for this project; do not copy another project's implementation.
- No real credentials in source, fixtures, logs, images, or tracked files; ignored env files with safe `.env.example` placeholders only.
- No BigQuery, Bedrock, or AWS use in this task.
- Dependency installation and Docker image pulls require user approval (network). Docker 29.9 and Docker Compose 5.6 are installed locally; Node 24 per `.nvmrc`.
- Security baseline: [SECURITY-BASELINE.md](../../../security/SECURITY-BASELINE.md). UI uses the approved design system; no new styling decisions.

## Open questions

None. The spec-stage questions were resolved in [DEC-005 to DEC-008](DECISION-LOG.md) and in the proposals approved with the spec.

## Next action

The user commits the approved spec and plan. Then run `/implementation`, starting with plan step 1 (install approval).
