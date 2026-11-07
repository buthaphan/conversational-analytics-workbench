# Function review: Standard-user sign-in and showcase access

**Status:** Accepted for specification on 2026-11-08 (see `IDEA.md` decision); no blocking decisions remain  
**Task ID:** TASK-001  
**Proposed branch:** `feature/TASK-001-user-accounts`

## Summary

Authentication is useful for a public-facing showcase and for isolating each user's question/result session. Keep the first version focused: include sign-in/sign-out in the first local end-to-end slice; use one ordinary-user role; scope sessions and analysis data per user; and provide a clear logout/expiry path. There is no admin UI. Account provisioning remains an open operational decision.

## Product fit

- Supports the stated plan to let selected people try the showcase.
- Reinforces user-scoped analytics sessions and prevents one demo user from seeing another user's state.
- Avoids an administrator role and its extra authorization surface.

## Recommended scope for specification

Specify a single ordinary-user role, safe password/session handling, sign-in and sign-out, session expiry/revocation, generic authentication errors, rate limiting, CSRF/origin protections as appropriate to the selected deployment, and user-scoped application state. Define a simple account-provisioning and expiry path before the spec is approved.

Avoid adding account administration UI. If owner-only account provisioning is required, keep it outside the signed-in app for the first milestone (for example, an owner-operated process) and document who can perform it. Do not assume a CLI, self-signup, invitations, or an admin API until the user chooses.

## Risks and mitigations

- **Unclear account lifecycle:** decide how users get an account and how temporary access ends before implementation.
- **Lingering data after close:** a closed browser sends no signal, so analysis data remains until the inactivity timeout passes. Test that expired sessions and their analysis data are actually deleted, not just rejected.
- **Cross-user data leakage:** include user ownership in session/query state and test attempts to access another user's data.
- **Demo account exposure:** the seeded local account has a known, weak password. The spec must ensure the seed cannot run outside local development and tests (for example, it refuses when the environment is not local) and that the account never exists on the AWS showcase. Showcase accounts need their own provisioning without shared static passwords.
- **Unnecessary complexity:** keep to one role and defer MFA/SSO/password recovery unless needed for the demo.
- **Deployment mismatch:** choose cookie/session settings for the actual same-origin architecture and HTTPS showcase, not only local development.

## Recommendation

Make this the first task (TASK-001), including the minimal repository, Docker Compose, and CI foundation it needs, because no other feature can be built or tested end to end without it. Agreed: ordinary-user-only access, PostgreSQL session storage, one session per user (new sign-in ends the previous one), refresh keeps the session, closing without sign-out counts as sign-out, and all analysis data is deleted when a session ends. Local accounts come from a seed (`user@example.test`, local development and tests only). Sessions end after 10 minutes of inactivity. Showcase provisioning is decided before AWS work. Build authentication for this project; do not reuse another project's auth implementation.


