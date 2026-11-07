# Implementation plan: TASK-001 User accounts and sign-in

**Spec revision:** 1 (approved 2026-11-08)  
**Status:** Approved for implementation (2026-11-08)

| Step | Behavior / change | Acceptance criteria | Test-first step | Dependencies |
|---|---|---|---|---|
| 1 | Ask the user to approve the npm installs and Docker image pulls. Create the `api/` workspace (NestJS, TypeScript, Vitest with SWC, shared ESLint and Prettier) with `GET /api/health`. Make the root scripts cover both workspaces. | AC-1 | Health endpoint HTTP test fails (module missing), then passes | User approval |
| 2 | `.env.example`; Compose with the `postgres` service only; test-database setup; Prisma schema and first migration for `users`, `auth_sessions`, `sign_in_attempts`. | AC-2, AC-16 (part) | Constraint tests (case-insensitive unique email, one session per user, cascade) fail before the migration, then pass | 1 |
| 3 | Configuration and clock: idle timeout (default and maximum 10 minutes), 12-hour maximum, `APP_ORIGIN`, `COOKIE_SECURE`, production startup checks; an injectable clock. | AC-6 (config), AC-11 (startup) | Config unit tests (longer idle timeout rejected; production refusals) red, then green | 1 |
| 4 | Password hashing with `crypto.scrypt`. | AC-3 | Round-trip, wrong-password, distinct-salt, default-parameter, and malformed-hash tests red, then green | 1 |
| 5 | Session store: token generation, hash-only storage, validity rules, and the single end path (mark ended, then run cleanup steps and delete in one transaction). | AC-9 (core), AC-11 (token hash) | Recording and failing cleanup-step tests; raw token not found in the database; red, then green | 2, 3 |
| 6 | `POST /api/auth/sign-in`: validation, email normalization, generic 401 with a dummy hash check, cookie issue. | AC-4, AC-11 (cookie) | HTTP tests for success, generic failures, and each 400 case red, then green | 4, 5 |
| 7 | One session per user, including concurrent sign-ins. | AC-5 | Replaced-session and concurrent tests red, then green | 6 |
| 8 | Session guard and `GET /api/auth/session`: activity update, idle and 12-hour expiry, cookie cleared on 401. | AC-6, AC-7 | Fake-clock boundary tests (9:59 and 10:00; 12 hours) red, then green | 5, 6 |
| 9 | `POST /api/auth/sign-out`, idempotent. | AC-8 | Sign-out and idempotency tests red, then green | 8 |
| 10 | `Origin` check on `POST`, `Secure` cookie mode, `Cache-Control: no-store`, 10 kB body limit, and log redaction. | AC-11 | Origin, header, secure-mode, and log-capture tests red, then green | 6, 9 |
| 11 | Rate limiting in PostgreSQL (per email and per IP). | AC-10 | Threshold, window, success-clears, IP, and restart tests red, then green | 6 |
| 12 | Sweep on start and every 60 seconds: expired sessions, cleanup retries, old attempt records. | AC-9 | Fake-clock sweep tests (including a retry after a failing cleanup) red, then green | 5, 11 |
| 13 | Development seed and the production development-account startup guard. | AC-12 | Allowed, refused, idempotent, and startup-refusal tests red, then green | 3, 4 |
| 14 | Web: API client, session state on load, Vite `/api` proxy, and the reference page moved to `/design-reference`. | AC-14 (load), AC-15 | Component tests for loading, signed-out, and signed-in states and the reference path red, then green; build check stays green | 8 |
| 15 | Sign-in screen. | AC-13 | Field errors, loading, 401, 429, network error, focus, and axe tests red, then green | 14 |
| 16 | Signed-in shell, sign-out, 2-minute and visibility keep-alive, and the session-ended message. | AC-14 | Fake-timer and mocked-fetch tests red, then green | 14, 15 |
| 17 | Dockerfiles (API; web on unprivileged nginx with the `/api` proxy) and the full Compose stack with health checks. | AC-16 | Not unit-testable: build images, run `docker compose up --build`, and sign in through nginx | 13, 16 |
| 18 | CI: PostgreSQL service, migrations, both workspaces, image builds. | AC-17 | Inspection against the AC-17 list; the same scripts pass locally | 1–17 |
| 19 | Documentation: README, `PROJECT-SETUP.md`, auth `IDEA.md`, `.env.example` comments. | AC-18 | Inspection against the AC-18 list | 17 |
| 20 | Final verification and the manual browser check with the user. | AC-1, AC-16, AC-19 | Not test-first; results recorded | 1–19 |

## Verification sequence

1. During each red/green cycle: run only the focused test file. API tests need `docker compose up -d postgres`.
2. After step 19: from a clean install, run `npm ci`, `format:check`, `lint`, `typecheck`, `test`, and `build`. Then run the API test suite several times in a row to check for flakiness. Then run `npm audit` (needs network; ask first).
3. Step 20 with the user, then hand off to `/task-review`.

## Risks / coordination

- **Vitest with NestJS:** decorator metadata needs SWC. If `unplugin-swc` does not work with the installed versions, record the substitution (for example Jest for the API only) and tell the user.
- **Prisma on Windows and Alpine:** the generated client needs the right engine for the container. Set the binary targets in the Prisma schema, and check the image at step 17.
- **Database tests:** use a separate test database and reset it between tests so they can't interfere. Run the API test files one at a time if parallel runs share the database.
- **Concurrent sign-in:** rely on the unique `user_id` constraint and a transaction rather than application locking. The test must show exactly one valid session.
- **Timer throttling:** the 2-minute keep-alive assumes background tabs still fire timers about once a minute. Device sleep ends the session, which is intended. AC-19 checks real browser behavior.
- **Ports in use:** if 5432 or 8080 is taken locally, the ports are configurable in `.env`.
- **TASK-003 handover:** analysis tables reference `auth_sessions` and register a cleanup step; this task provides the registration point and its tests.
