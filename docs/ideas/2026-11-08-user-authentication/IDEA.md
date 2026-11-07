# Idea: Standard-user sign-in and showcase access

## Decision

- **Status:** accepted for specification
- **Decision date:** 2026-11-08
- **Chosen scope:** First task. Ordinary user accounts, sign-in, and sign-out, with the session rules under "Agreed behavior". Includes the minimal repository, Docker Compose (web, API, PostgreSQL), and CI foundation needed to build and test it. Analytics features are out of scope.
- **Proposed task/branch:** TASK-001, `feature/TASK-001-user-accounts`
- **Sequencing (2026-11-08):** specification paused until TASK-002 (design system) is approved; see the TASK-001 decision log on its branch. TASK-002 now delivers the web app skeleton, so TASK-001 keeps the API, PostgreSQL, and Docker Compose foundation.
- **Account provisioning (decided 2026-11-08):** a seed creates one ordinary local account, `user@example.test` with password `123456`. This is a known, deliberately weak development credential: it is for local development and automated tests only and must never be created in the AWS showcase or any internet-reachable environment. Store only a password hash, never the plain password.
- **Inactivity timeout (decided 2026-11-08):** 10 minutes with no activity from an open page ends the session. An open page must keep the session alive while it is in use, so a refresh or an idle-but-open tab under 10 minutes keeps the same session.
- **Still open, not blocking TASK-001:** how showcase users get accounts on AWS.

## Problem

The workbench needs sign-in from its first local end-to-end slice and before a public showcase. All signed-in people are ordinary users with the same application capabilities. The one-page app has no administrator role, admin page, or admin-only route.

## Intended outcome

A signed-in user can access the one-page workspace, keep analysis state isolated from other users, and end the session safely. Account provisioning for selected showcase users remains to be decided.

## Boundaries

- Build authentication specifically for this project; do not copy another project's auth implementation.
- No administrator role, admin console, or admin-only routes.
- No self-service signup, invite links, password reset, MFA, or SSO has been approved yet.
- Account provisioning and whether accounts themselves expire remain open.
- Do not store or send real credentials in the repository or Claude conversation.

## Agreed behavior

- Include sign-in/sign-out in the first local end-to-end slice and before public AWS access.
- Use one ordinary-user role only; no admin feature in the one-page app.
- Keep analysis state in PostgreSQL, scoped to the user and current authentication session.
- One device: a user has at most one authentication session. Signing in on another device or browser ends the previous session.
- A page refresh keeps the same session.
- Closing the app without signing out counts as signing out, enforced by a short server-side inactivity timeout (browsers do not reliably report a close).
- When a session ends for any reason, delete its analysis session, questions, and result data. Re-login starts with an empty analysis session.

## Open questions

- How should showcase users get accounts on AWS: pre-created by the owner, invitation, or self-registration? (Local development uses the seeded account; this is needed before the public showcase, not for TASK-001.)
- What does time-limited showcase access mean: account expiry, access-code expiry, or only session expiry?
- Whether there is also an absolute session lifetime in addition to the 10-minute inactivity timeout (not blocking TASK-001).
- Should the first milestone include password recovery, MFA, or social/enterprise login? Recommendation is to defer unless a clear showcase need exists.


