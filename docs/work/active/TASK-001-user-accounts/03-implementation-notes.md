# Implementation notes: TASK-001 User accounts and sign-in

**Spec revision:** 1 (approved 2026-11-08)  
**Plan:** [02-implementation-plan.md](02-implementation-plan.md)  
**Branch:** `feature/TASK-001-user-accounts` (started from `93d8d5a`; all changes uncommitted)  
**Status:** All 20 plan steps done. The manual browser check (AC-19) was done by the user in Chrome on 2026-11-08: 8 of 9 items passed and the idle-timeout item was skipped. Ready for `/task-review`.

## Changed files

| Area | Files |
|---|---|
| Workspace | `package.json` (workspaces `web`, `api`; root scripts run both), `package-lock.json`, `.gitignore` (`api/src/generated/`), `.gitattributes` (`*.sh` stays LF) |
| API config | `api/package.json`, `api/tsconfig.json`, `api/tsconfig.build.json`, `api/eslint.config.mjs`, `api/vitest.config.mts`, `api/.prettierrc.json`, `api/.prettierignore`, `api/prisma.config.ts`, `api/scripts/dev.mjs` |
| Database | `api/prisma/schema.prisma`, `api/prisma/migrations/20261107211454_init/` (adds a hand-written lowercase-email CHECK), `docker/postgres/init/01-create-test-database.sh` |
| API code | `api/src/main.ts`, `app.ts`, `app.module.ts`; `config/`, `database/`, `time/clock.ts`, `health/`, `security/origin.guard.ts`, `sessions/` (store, cleanup registry, sweeper), `auth/` (password, password service, rate limiter, guard, cookie, DTO, service, controller), `seed/` (seed, CLI, production guard) |
| API tests | `*.test.ts` beside each module; helpers in `api/src/test/` (test database with `_test` guard, global migration setup, app builder, fake clock) |
| Web | `web/src/App.tsx`, `web/src/layout/Layout.tsx`, `web/src/auth/` (`api.ts`, `SignInScreen.tsx`, `AuthApp.tsx`), `web/vite.config.ts` (dev proxy) |
| Web tests | `web/src/App.test.tsx` (rewritten), `web/src/auth/*.test.ts(x)`, `web/src/test/fetch.ts` |
| Containers | `compose.yaml`, `api/Dockerfile`, `web/Dockerfile`, `web/nginx.conf`, `.dockerignore` (now matches nested paths) |
| Settings template | `example.env` (see deviations) |
| CI | `.github/workflows/ci.yml` |
| Docs | `README.md`, `docs/PROJECT-SETUP.md`, `docs/ideas/2026-11-08-user-authentication/IDEA.md` |

**Note on `git status`:** it also lists about 45 `web/` files from TASK-002 as modified. They are not: `git diff` shows no content change, not even line endings. Their timestamps changed (Prettier rewrote them with identical bytes, and the clean install touched them), and Git flags them until it re-checks their contents. `git add` records nothing for them.

## Dependencies

All installed with user approval (2026-11-08) at current stable versions and pinned in `package-lock.json`.

- **API runtime:** NestJS 12.4 (`@nestjs/core`, `common`, `platform-express`), `reflect-metadata` 0.2, `rxjs` 7.8, Prisma 7.10.1 (`prisma`, `@prisma/client`, `@prisma/adapter-pg`), `pg` 8.23, `cookie-parser` 1.4, `class-validator` 0.15, `class-transformer` 0.5.
- **API development:** `@nestjs/testing`, `supertest`, `@types/{supertest,cookie-parser,express,pg,node}`, `unplugin-swc` 2.0, `@swc/core` 1.16, plus the same TypeScript, Vitest, ESLint, and Prettier versions as `web`.
- **Images (pinned):** `postgres:18.6-alpine`, `node:24.22.2-alpine` (build stages and API runtime), `nginxinc/nginx-unprivileged:1.30.6-alpine`.
- npm held back the install scripts of `@swc/core`, `prisma`, and `@prisma/engines` (npm 11's install-script protection). Both tools worked without them, so the protection was left unchanged.

## Test-first evidence

Each step's test was written and run before the production code. "Red" is the observed failure.

| Step | Test(s) | Red (observed) | Green |
|---|---|---|---|
| 1 | `health.controller.test.ts` | `../app` could not be resolved | 2/2; built server answered `{"status":"ok"}` |
| 2 | `database/schema.test.ts` | `relation "sign_in_attempts" does not exist` (no migration yet) | 6/6 after the migration |
| 3 | `config/config.test.ts` | Module missing | 17/17 |
| 4 | `auth/password.test.ts` | Module missing | 11/11 |
| 5 | `sessions/session.store.test.ts` | `../time/clock` unresolved | 14/14. A later concurrency test (10 parallel ends, 5 rounds) was **red: cleanup ran 6 times for one session**, with false "cleanup failed" errors. Fixed with a row lock (`SELECT … FOR UPDATE`); 15/15. |
| 6–9 | `auth/auth.http.test.ts` | `./password.service` unresolved | All green. Then Nest's default form-data parser was found to accept form posts; default parsers were switched off and a form-encoded case added (400). |
| 10 | `auth/security.http.test.ts` | 7 failed (Origin check, `no-store`, logs). The cookie attributes and the 413 body limit **passed on first run**: steps 6–9 already provided them. | 11/11. The log test was found to be **vacuous** (Nest's testing logger drops everything below "error"), so it now captures every level. A mutation check (temporarily logging the password) made it fail as intended; reverted. |
| 11 | `auth/rate-limit.http.test.ts` | 6 failed | 9/9. Two tests making many unknown-email attempts take about 5 s (real scrypt), so they got a 30 s timeout before they could become flaky. |
| 12 | `sessions/session.sweeper.test.ts` | Module missing | 7/7 |
| 13 | `seed/dev-seed.test.ts`, `seed/dev-account.guard.test.ts` | Modules missing | 15/15. Real CLI run: seed exit 0; with `ALLOW_DEV_SEED=false`, refused with exit 1. |
| 14 | `web/src/auth/api.test.ts` | `./api` unresolved | 13/13 |
| 14–16 | `App.test.tsx`, `SignInScreen.test.tsx`, `AuthApp.test.tsx` | App: 5 of 6 failed. The `/design-reference` test passed **for the wrong reason** (the old app showed the reference page on every path); it now passes because of the path check. Components: unresolved. | All green; web suite 284/284 (249 from TASK-002 plus 35 new) |
| 17 | Not unit-testable | — | Images built; full stack verified (below) |
| 18 | Inspection | — | Workflow reviewed against AC-17 |

## Verification

Run 2026-11-08 on Windows 11, Node v24.16.0, npm 11.17.0, Docker 29.9.2, with PostgreSQL running (`docker compose up -d postgres`).

**Clean install and all checks** (`api/src/generated`, `api/dist`, and `web/dist` deleted first):

| Command | Result |
|---|---|
| `npm ci` | exit 0 (536 packages) |
| `npm run db:generate -w api` | exit 0 |
| `npm run format:check` | exit 0 (both workspaces) |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` | exit 0: web 21 files, 284 tests; API 11 files, 118 tests |
| `npm run build` | exit 0; web `check:build` 2/2 |
| Repeated runs | API suite 5 of 5 passed (118 each); web suite 4 of 4 passed (284 each) |

The API test output includes four `ERROR [SessionStore]`/sweeper log lines. They come from the tests that make cleanup fail on purpose, and they log only the error type.

**Development mode (AC-1):** with the built API on port 3000 and `npm run dev` on 5173, requests through Vite's proxy gave: sign-in 200 with `cawb_session=…; Path=/; HttpOnly; SameSite=Strict`; session 200; sign-out 204; then session 401.

**Docker Compose (AC-16):** `docker compose up -d` started all three services healthy. Published ports: `127.0.0.1:8080` (web) and `127.0.0.1:5432` (PostgreSQL); the API is not published. Container users: `node` (API) and `nginx` (web). The seed ran in the API container. Through `http://127.0.0.1:8080`:
- The index is served with `X-Content-Type-Options: nosniff`.
- Sign-in returns 200 with `Cache-Control: no-store` and the same cookie attributes.
- The session check returns 200, and sign-out 204.
- An `Origin` of `http://localhost:8080` gets 403.
- `/design-reference` is not in the production build.

**Dependency audit (user-approved, 2026-11-08):**
- `npm audit --omit=dev`: **0 vulnerabilities**. This covers everything that ships, including the new API runtime (NestJS, Prisma, `pg`, `cookie-parser`, `class-validator`).
- `npm audit`: 10 moderate findings, all one advisory: `minimatch` (GHSA-g3hv-75wg-m249) reached through ESLint 10 and `typescript-eslint`. It is the same development-only finding TASK-002 accepted ([TASK-002 DEC-004](../../completed/TASK-002-design-system/DECISION-LOG.md#dec-004--development-only-audit-finding)). TASK-001 adds no new finding.

## Acceptance criteria mapping

| AC | Status | Evidence |
|---|---|---|
| AC-1 | Met | Clean-install table; dev-mode run through the proxy |
| AC-2 | Met | `schema.test.ts` (unique lowercase email via CHECK, one session per user, unique token hash, cascade, attempts) |
| AC-3 | Met | `password.test.ts` (OWASP defaults, stored parameters, salt and key lengths, distinct salts, malformed and tampered hashes) |
| AC-4 | Met | `auth.http.test.ts` (success, trim and case, identical 401s, dummy verify for unknown email, seven 400 cases and two non-JSON bodies without a hash) |
| AC-5 | Met | `auth.http.test.ts` (replaced session gets 401; three concurrent sign-ins leave one valid session); `session.store.test.ts` |
| AC-6 | Met | Store and HTTP fake-clock tests (just under 10 minutes accepted, 10 minutes rejected, 12-hour limit despite activity, cookie cleared); config rejects longer idle timeouts |
| AC-7 | Met | `auth.http.test.ts` (repeated requests with one cookie; no cookie or unknown token gets 401) |
| AC-8 | Met | `auth.http.test.ts` (sign-out, cookie cleared, idempotent cases) |
| AC-9 | Met | Store tests (each reason, cleanup arguments, failing cleanup keeps the token rejected, same transaction, exactly once under concurrency); sweeper tests (idle, max age, retry, start plus 60-second schedule) |
| AC-10 | Met | `rate-limit.http.test.ts` (4 allowed, 5th blocks even with the correct password, `Retry-After`, window expiry, success clears, IP limit, survives a new app instance) |
| AC-11 | Met | `security.http.test.ts` (Origin cases, cookie in both modes, `no-store`, 413, logs free of secrets); raw token absent from every table (store test); production startup refusals (`config.test.ts`) |
| AC-12 | Met | `dev-seed.test.ts` (allowed in development and test, six refusal cases write nothing, idempotent, CLI exit codes); `dev-account.guard.test.ts` |
| AC-13 | Met | `SignInScreen.test.tsx` (labels and autocomplete, field errors without a request, loading and repeat submits, 401/429/500/network messages with focus, notices, axe) |
| AC-14 | Met | `AuthApp.test.tsx` (shell content, 2-minute keep-alive, visibility ping, session-ended message, network blip tolerated, sign-out and its failure, axe); `App.test.tsx` (refresh path) |
| AC-15 | Met | `App.test.tsx` (reference page at `/design-reference` without fetching); `check:build` |
| AC-16 | Met | Compose run recorded above |
| AC-17 | Implemented; **GitHub run unverified** | Workflow: Node from `.nvmrc`, PostgreSQL service with placeholder credentials, generate, format, lint, typecheck, test, build, and an `images` job that builds both images without pushing; `contents: read`; no secrets. It runs after the user pushes. |
| AC-18 | Met | README (current stage, Run locally), `PROJECT-SETUP.md` (#1 partly, #8, decision rows), auth `IDEA.md`, commented `example.env` |
| AC-19 | **Met except one item** (user, Chrome, 2026-11-08) | 8 of 9 checklist items passed. Item 7 (a closed tab's session ends with a shortened idle timeout) was skipped by the user; that behavior has automated evidence only (AC-6, AC-9). Accepting this is a review/closeout decision. |

## Deviations and decisions within scope

- **Prisma 7 driver adapter (user-approved 2026-11-08):** Prisma 7 needs `@prisma/adapter-pg` and `pg` (plus `@types/pg`) to reach PostgreSQL. `.env` files are loaded with Node's built-in `--env-file` and `process.loadEnvFile`, so no `dotenv`.
- **Prisma version:** npm's `latest` tag for `prisma` points to a release candidate (8.0.0-rc); the stable 7.10.1 (matching `@prisma/client`) was used.
- **`prisma` is a runtime dependency:** the API container runs `prisma migrate deploy` on start (AC-16), so the CLI must be in the image.
- **Settings template named `example.env` (user decision, 2026-11-08):** the project's permission rules block Claude from any `.env.*` file, including `.env.example`. The spec's `.env.example` refers to this file.
- **Config file extensions:** `api/eslint.config.mjs` and `api/vitest.config.mts`, because the API package is CommonJS (NestJS).
- **Body parsing:** Nest's default parsers are off, and only a 10 kB JSON parser is registered, so form posts are rejected (AC-4, AC-11).
- **Messages added beyond the spec:** `Something went wrong. Try again.` (unexpected sign-in response), `Could not sign out. Try again.` (sign-out failure; the user stays signed in), and the session-load network error reuses the AC-13 network message. A 400 from the server shows the generic incorrect-credentials message.
- **Sign-in while the previous session's cleanup keeps failing:** the new sign-in fails with a generic 500 rather than leaving two sessions; the sweep keeps retrying the cleanup.
- **Sweeper:** not scheduled when `NODE_ENV=test`; tests call `sweep()` directly with a fake clock.
- **Test database guard:** tests refuse any database whose name does not end in `_test`. The test database is created by the PostgreSQL init script on first start.
- **nginx:** sets `nosniff`, `X-Frame-Options: DENY`, and `Referrer-Policy: same-origin`; it replaces (rather than appends to) `X-Forwarded-For`, so the rate limit sees the real client.
- **Exact origin:** the Compose stack's `APP_ORIGIN` is `http://127.0.0.1:8080`, so opening `http://localhost:8080` makes sign-in fail with 403. The README says to use the exact address.

## Limitations and follow-ups

1. **Dependency audit:** done. Runtime 0; the development-only `minimatch` advisory remains, as accepted in TASK-002 DEC-004.
2. **AC-19:** the idle-timeout manual item was skipped (automated evidence only). **AC-17** is verified on GitHub after the push.
3. **API tests take about 60–80 s**, mostly real scrypt hashing for unknown-email checks. Acceptable for now; a test-only lower cost for the dummy hash would speed them up.
4. **In npm development mode the API listens on all network interfaces (port 3000).** That is fine on a private machine; binding to `127.0.0.1` outside containers is a small follow-up.
5. **No Content-Security-Policy yet.** Worth adding with the AWS deployment task, after checking it against the production build.
6. **One API instance** is assumed for the sweep (stated in the spec).
7. **TASK-003 handover:** register a cleanup step with `SessionCleanupRegistry` and reference `auth_sessions` for analysis data.

## Manual check for AC-19

Run `docker compose up --build -d`, then `docker compose exec api node dist/seed/seed-cli.js`, then open **http://127.0.0.1:8080** in a current desktop browser.

| # | Check | Result (fill in) |
|---|---|---|
| 1 | Sign in as `user@example.test` with the development password: the shell shows your email and **Sign out** | Pass (user) |
| 2 | Refresh the page: still signed in, with no sign-in screen | Pass (user) |
| 3 | Open a second tab at the same address: also signed in | Pass (user) |
| 4 | Sign in from a second browser (or a private window): within 2 minutes the first browser shows "Your session has ended. Sign in again." | Pass (user, private window) |
| 5 | Click **Sign out**: "You have signed out." appears, and refreshing shows the sign-in screen | Pass (user) |
| 6 | Developer tools → Application/Storage → Cookies: `cawb_session` shows HttpOnly and SameSite=Strict | Pass (user) |
| 7 | Short idle timeout: add `SESSION_IDLE_TIMEOUT_SECONDS=120` to `.env`, run `docker compose up -d api`, sign in, close the tab, wait 3 minutes, reopen: the sign-in screen shows. Remove the line and run `docker compose up -d api` again afterwards. | **Skipped by the user.** Idle expiry is covered by automated tests only (AC-6 boundary tests, AC-9 sweep tests). |
| 8 | Keyboard only: Tab to the fields and the button, type, and press Enter to sign in; focus is visible throughout | Pass (user) |
| 9 | Narrow the window to 320 px: the sign-in form and shell fit without sideways scrolling | Pass (user) |

Browser used: Chrome (current desktop version)  Date: 2026-11-08  
Checks performed by the user; results reported to Claude and recorded here with the user.

## Simplicity check

No meaningful complexity concern. Modules are small and single-purpose: the store owns session rules, the sweeper owns timing, the controller is thin, and the web app has one state machine (`AuthApp`). The longest file is `session.store.ts` (about 160 lines). No `/code-simplicity` stage is needed.

## Handoff

Next: `/task-review`.
