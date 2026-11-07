# Task context: TASK-001 User accounts and sign-in

**Branch:** `feature/TASK-001-user-accounts`  
**Idea record:** [IDEA.md](../../../ideas/2026-11-08-user-authentication/IDEA.md), [FUNCTION-REVIEW.md](../../../ideas/2026-11-08-user-authentication/FUNCTION-REVIEW.md) (committed on `main` in `458c94a`)  
**Status:** Paused before specification — waiting for the design-system task ([DEC-001](DECISION-LOG.md#dec-001--sign-in-ui-before-the-design-system-task)). Keep-alive, hashing, and database tooling are decided ([DEC-002 to DEC-004](DECISION-LOG.md)).

## Accepted intent

An ordinary user can sign in, reach a signed-in one-page workspace shell, and sign out, with server-side sessions that follow the agreed session rules. The task also establishes the minimal repository, Docker Compose, and CI foundation needed to build and test this. Analytics features are out of scope. The idea record remains canonical.

## Relevant approved decisions

- One ordinary-user role; no admin role, route, or UI. ([CLAUDE.md](../../../../CLAUDE.md), [PROJECT-SETUP.md](../../../PROJECT-SETUP.md))
- Stack: TypeScript; React + Vite, Tailwind, shadcn-style components; NestJS API; PostgreSQL; Docker Compose; GitHub Actions CI with no AWS credentials or deployment. ([PROJECT-SETUP.md](../../../PROJECT-SETUP.md#engineering-decisions))
- Local account: a seed creates `user@example.test` / `123456` for local development and tests only. Never created in the AWS showcase or any internet-reachable environment; only the password hash is stored. ([IDEA.md](../../../ideas/2026-11-08-user-authentication/IDEA.md#decision))
- One authentication session per user; a new sign-in ends the previous session.
- A page refresh keeps the same session.
- Closing the app without signing out counts as signing out, enforced by a 10-minute server-side inactivity timeout. An open page keeps the session alive while it is in use.
- When a session ends for any reason, its analysis-session data is deleted. (In this task no analysis data exists yet; the spec should define the session-end hook that TASK-002 will rely on.)
- During an approved implementation, ordinary local test runs are authorized; installs, network use, and external services need approval.

## Constraints and dependencies

- Build authentication for this project; do not copy another project's implementation.
- No real credentials in source, fixtures, logs, images, or tracked files; ignored env files with safe `.env.example` placeholders only.
- No BigQuery, Bedrock, or AWS use in this task.
- Dependency installation and Docker image pulls require user approval (network).
- Security baseline: [SECURITY-BASELINE.md](../../../security/SECURITY-BASELINE.md). Design direction: [DESIGN-SYSTEM.md](../../../design/DESIGN-SYSTEM.md) (final tokens are still open; the sign-in screen may use provisional styling).

## Open questions for the spec stage

- Password hashing algorithm and library (for example Argon2id or bcrypt).
- Session mechanism: server-side session table in PostgreSQL with an HTTP-only cookie; cookie attributes for local HTTP versus the future HTTPS showcase.
- How the open page keeps the session alive (activity-based renewal or a periodic heartbeat) and how expired sessions are swept and deleted.
- Guard that prevents the seed from running outside local development and tests.
- Sign-in rate limiting, generic error messages, and CSRF/origin protection.
- Database migration tooling and the exact Docker Compose service layout (open decision #8).
- CI checks to include now (format/lint, type check, tests, builds, container builds).
- Minimal signed-in workspace shell: what is shown after sign-in in this task.
- Whether an absolute session lifetime is wanted (non-blocking).

## Next action

Complete the design-system task first. Then resume `/spec-driven` on this branch to produce `01-spec.md` (acceptance criteria, test plan, Definition of Done) and `02-implementation-plan.md`, using DEC-002 to DEC-004, and request user approval.
