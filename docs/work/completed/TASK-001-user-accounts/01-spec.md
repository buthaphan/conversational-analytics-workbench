# Specification: TASK-001 User accounts and sign-in

**Status:** Approved (2026-11-08)  
**Revision:** 1  
**Owner:** User  
**Related idea:** [IDEA.md](../../../ideas/2026-11-08-user-authentication/IDEA.md), [FUNCTION-REVIEW.md](../../../ideas/2026-11-08-user-authentication/FUNCTION-REVIEW.md), [00-context.md](00-context.md)  
**Decision log:** [DECISION-LOG.md](DECISION-LOG.md)

## Problem and goal

The workbench has a design system and a web skeleton, but no users, sessions, API, or database. Every later feature needs a signed-in user whose analysis data is isolated and deleted when the session ends.

Goal: an ordinary user can sign in, stay signed in across refreshes and open tabs, and sign out. Sessions end on sign-out, after 10 minutes without an open page, after 12 hours, or when the same user signs in elsewhere. Every session end goes through one cleanup point that TASK-003 will use for analysis data. Success is measured by passing automated API and web tests against a real PostgreSQL database, a passing CI run, and a manual browser checklist.

## Scope

### In scope

- `api/` npm workspace: NestJS API in TypeScript, Prisma with PostgreSQL ([DEC-004](DECISION-LOG.md#dec-004--database-tooling)).
- Data model: users, authentication sessions, and sign-in attempts, with migrations.
- Endpoints under `/api`: health, sign-in, sign-out, and current session (which also serves as the keep-alive).
- Password hashing with Node `crypto.scrypt` ([DEC-003](DECISION-LOG.md#dec-003--password-hashing)).
- Session rules: one session per user, 10-minute inactivity timeout, 12-hour maximum ([DEC-007](DECISION-LOG.md#dec-007--absolute-session-lifetime)), refresh keeps the session, and a single session-end cleanup point with a periodic sweep.
- Sign-in rate limiting stored in PostgreSQL ([DEC-006](DECISION-LOG.md#dec-006--sign-in-rate-limiting)).
- Development seed for the local account `user@example.test`, with guards that keep it out of non-local environments.
- Web: sign-in screen, signed-in workspace shell with sign-out, keep-alive, and session-ended handling, built only from TASK-002 components and tokens.
- Docker Compose with PostgreSQL, API, and web; day-to-day development with only PostgreSQL in Docker ([DEC-005](DECISION-LOG.md#dec-005--docker-compose-layout)).
- CI extended to the API (with a PostgreSQL service) and to container image builds.
- Documentation: README current stage and how to run; `PROJECT-SETUP.md` open decisions #1 (partly) and #8; auth `IDEA.md` open items.

### Out of scope

- Self-service signup, invitations, password reset or change, MFA, SSO, account expiry, or any account administration.
- Showcase account provisioning and anything on AWS (project open decision #1).
- Analysis sessions, questions, and result data (TASK-003). This task provides only the cleanup point and proves it runs.
- HTTPS locally (the `Secure` cookie setting is enforced for production configuration only).
- Instant sign-out across tabs (tabs learn at their next keep-alive, within 2 minutes).
- Playwright or other real-browser automation ([DEC-008](DECISION-LOG.md#dec-008--test-tooling-for-browser-behavior)).
- Client-side routing; the app stays one page.

## Assumptions and dependencies

- Node 24 (`.nvmrc`), Docker 29.9, and Docker Compose 5.6 are installed locally (verified 2026-11-08).
- Dependencies are installed at current stable versions with user approval and pinned by `package-lock.json`. Expected API runtime: `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express`, `reflect-metadata`, `rxjs`, `@prisma/client`, `cookie-parser`, `class-validator`, `class-transformer`. Expected API development: `prisma`, `@nestjs/testing`, `supertest`, `@types/supertest`, `@types/cookie-parser`, `@types/express`, `vitest`, `unplugin-swc` and `@swc/core` (NestJS needs decorator metadata, which Vitest's default compiler does not emit), plus the existing TypeScript, ESLint, and Prettier setup. A substitution is recorded in the implementation notes; a material one goes to the decision log.
- Docker images, pulled with user approval and pinned to a specific version tag: PostgreSQL (current stable), Node 24 (build stages), and an unprivileged nginx (web runtime).
- API tests need a running PostgreSQL. Locally: `docker compose up -d postgres` with a separate test database. In CI: a PostgreSQL service container with placeholder credentials (not secrets).
- The known local development password for `user@example.test` is documented in `PROJECT-SETUP.md`. It is a deliberate placeholder, not a secret, and is never used outside local development and tests.

## Design overview

- **Same origin:** the browser only talks to the web origin. In development, Vite proxies `/api` to the API on `localhost:3000`. In Compose, nginx serves the built web app on `127.0.0.1:8080` and proxies `/api` to the API container. The API is not published to the host in Compose.
- **Session token:** 32 random bytes from `crypto.randomBytes`, sent to the browser in a cookie. The database stores only a SHA-256 hash of the token.
- **Cookie:** `HttpOnly`, `SameSite=Strict`, `Path=/`, no `Max-Age` (a browser-session cookie). `Secure` and the `__Host-` name prefix apply when `COOKIE_SECURE=true`.
- **Validity:** a session is valid only if it is not ended, its last activity is within 10 minutes, and it is within 12 hours of sign-in. Any authenticated API request counts as activity.
- **Keep-alive:** each open tab calls `GET /api/auth/session` every 2 minutes and when the tab becomes visible. Browsers throttle hidden-tab timers to about once a minute, so this stays well inside 10 minutes.
- **Ending a session:** every end path (sign-out, replaced by a new sign-in, inactivity, 12-hour limit) first marks the session ended, so its token is rejected immediately. It then runs the registered cleanup steps and deletes the session in one transaction. If cleanup fails, the session stays marked ended and the sweep retries.
- **Sweep:** runs on API start and every 60 seconds. It ends expired sessions, retries unfinished cleanups, and deletes sign-in attempt records older than 24 hours.

## Acceptance criteria

| ID | Given / when / then or measurable criterion | Verification evidence | Status |
|---|---|---|---|
| AC-1 | **Workspace and scripts.** The root `package.json` declares `web` and `api` as workspaces. From a clean checkout with PostgreSQL running, `npm ci` then root `format:check`, `lint`, `typecheck`, `test`, and `build` exit 0 and cover both workspaces. `npm run dev` (web) and `npm run dev -w api` run locally, with web requests to `/api` reaching the API. | Command output in implementation notes | Not started |
| AC-2 | **Data model.** Prisma migrations create: `users` (id, unique lowercase email, password hash, created time); `auth_sessions` (id, unique user id, unique token hash, created, last activity, absolute expiry, ended time); `sign_in_attempts` (normalized email, client IP, time). Deleting a user deletes their sessions. A second session row for the same user is rejected by the database. | Migration inspection; integration tests on the constraints | Not started |
| AC-3 | **Password hashing.** Hashes use `crypto.scrypt` with a 16-byte random salt per password, a 64-byte key, and N=2^17, r=8, p=1 by default (OWASP). Parameters and salt are stored with the hash, and verification uses a constant-time comparison. Two hashes of the same password differ. The plain password is never stored or logged. | Unit tests (round trip, wrong password, distinct salts, default parameters, malformed hash rejected) | Not started |
| AC-4 | **Sign-in.** `POST /api/auth/sign-in` with JSON `{email, password}`, where the email is trimmed and compared case-insensitively. On success: 200 with `{user: {email}}`, a session created, and the cookie set. Unknown email and wrong password both return 401 with the identical body `Email or password is incorrect.`; an unknown email still runs a hash verification. A missing or invalid email (over 254 characters), an empty password or one over 1,024 characters, extra fields, or a non-JSON body returns 400 without a hash attempt. | HTTP integration tests against PostgreSQL | Not started |
| AC-5 | **One session per user.** When a user with a session signs in again (another browser), the previous session is ended through the cleanup point (reason `replaced`), and its token then gets 401 on every endpoint. At any time the user has at most one session row. Two concurrent sign-ins for the same user leave exactly one valid session. | Integration tests, including a concurrent case | Not started |
| AC-6 | **Session lifetime.** With a controllable clock: a request within 10 minutes of the last activity succeeds and extends it; a request 10 minutes or more after the last activity gets 401, and the session is ended (reason `idle`); a request 12 hours or more after sign-in gets 401 even with continuous activity (reason `max_age`). After 401, the response clears the cookie. A shorter idle timeout may be configured for manual testing, but never a longer one. | Integration tests with a fake clock; configuration unit test | Not started |
| AC-7 | **Current session and refresh.** `GET /api/auth/session` returns 200 with `{user: {email}}` for a valid session and 401 otherwise (no cookie, unknown token, ended, or expired). The same cookie works across repeated requests, so a page refresh keeps the session. | Integration tests | Not started |
| AC-8 | **Sign-out.** `POST /api/auth/sign-out` ends the session (reason `sign_out`), clears the cookie, and returns 204. It is idempotent: 204 with no cookie or an already-ended session. Afterwards the old token gets 401 everywhere. | Integration tests | Not started |
| AC-9 | **Session-end cleanup point.** All four end reasons (`sign_out`, `replaced`, `idle`, `max_age`) run every registered cleanup step with the session id, user id, and reason, then delete the session row in the same transaction. If a cleanup step fails, the token is still rejected, the row remains marked ended, and the next sweep retries until it succeeds. The sweep ends idle or over-age sessions within 60 seconds of their expiry, so a closed browser's session is deleted within 11 minutes of its last activity. | Integration tests with a recording and a failing test cleanup step; sweep tests with a fake clock | Not started |
| AC-10 | **Rate limiting.** Failed sign-ins are stored. When an email has 5 failures within 15 minutes, further attempts for that email, even with the correct password, get 429 with the body `Too many sign-in attempts. Try again later.` and a `Retry-After` header, until the window passes. The same applies to one client IP with 20 failures within 15 minutes. A successful sign-in clears that email's failures. Limits survive an API restart. | Integration tests with a fake clock, including restart (new app instance) | Not started |
| AC-11 | **Cookie, CSRF, and response security.** The session cookie is `HttpOnly; SameSite=Strict; Path=/` with no `Max-Age`; with `COOKIE_SECURE=true` it is also `Secure` and named with the `__Host-` prefix. `POST` requests whose `Origin` header is missing or differs from `APP_ORIGIN` get 403 and change nothing. Auth responses send `Cache-Control: no-store`. The database stores only token hashes (a raw token is not findable in any table). Logs never contain passwords, tokens, token hashes, or password hashes. In production (`NODE_ENV=production`), the API refuses to start unless `COOKIE_SECURE=true` and `APP_ORIGIN` is `https://…`. | Integration tests (headers, Origin cases, database search for the raw token, log capture during sign-in, sign-out, and failures); startup unit tests | Not started |
| AC-12 | **Development seed and guards.** `npm run db:seed -w api` creates or updates `user@example.test` with the documented development password, hashed per AC-3. It refuses with a non-zero exit, and writes nothing, unless `NODE_ENV` is `development` or `test` and `ALLOW_DEV_SEED=true`. In production, the API refuses to start if `user@example.test` exists. Running the seed twice leaves one user. | Seed tests (allowed, refused per condition, idempotent); startup test | Not started |
| AC-13 | **Sign-in screen.** When the app loads without a valid session, it shows a sign-in form using `Card`, `FormField`/`Input`, `Button`, and `Alert`. Email and password have visible labels and `autocomplete` (`username`, `current-password`); empty fields show field errors without a request. While submitting, the button shows loading and ignores repeat submits. A 401 shows the generic message, a 429 the rate-limit message, and a network failure `Could not reach the server. Try again.`, each in an error `Alert`. Focus moves to the error. No new colors, fonts, or raw color literals (the TASK-002 guard passes). | Component tests (React Testing Library, mocked fetch) with axe checks for each state | Not started |
| AC-14 | **Signed-in shell and session end in the browser.** With a valid session, the app shows a header with the logo, product name, signed-in email, and a `Sign out` button, and a main area placeholder saying the analytics workspace comes in a later task. A refresh shows the shell again without signing in. Each tab calls the session endpoint every 2 minutes and on becoming visible. When any request returns 401, the app shows the sign-in screen with an info `Alert`: `Your session has ended. Sign in again.` Sign-out returns to the sign-in screen with a status `Alert`: `You have signed out.` | Component tests with fake timers and mocked fetch; axe checks | Not started |
| AC-15 | **Design reference stays development-only.** The TASK-002 reference page moves from the app root to `/design-reference`, is reachable in development without signing in, and remains absent from the production build (existing `check:build` passes). | Component test; build check | Not started |
| AC-16 | **Docker Compose.** `docker compose up --build` starts PostgreSQL, API, and web with health checks. The web app is served on `http://127.0.0.1:8080`, and sign-in with the seeded account works end to end through nginx. Only the web port (8080) and PostgreSQL (5432, for development) are published, both bound to `127.0.0.1`. The API and web containers run as non-root users. The API runs `prisma migrate deploy` on start. `docker compose up -d postgres` alone supports npm-based development. Configuration comes from an ignored `.env` with a tracked `.env.example` containing placeholders only. | Manual run recorded in notes; image and Compose file inspection | Not started |
| AC-17 | **CI.** `.github/workflows/ci.yml` runs on push and pull request: Node from `.nvmrc`, `npm ci`, a PostgreSQL service with placeholder credentials, migrations, then format, lint, typecheck, test, and build for both workspaces, and builds both Docker images without pushing. It uses no secrets, AWS, or deployment, and keeps `permissions: contents: read`. | Workflow inspection; local runs of the same scripts; the GitHub run reported by the user | Not started |
| AC-18 | **Documentation.** README "Current stage" and a short "Run locally" section are current. `PROJECT-SETUP.md` records decision #8 (Compose layout) and the 12-hour maximum (part of #1). The auth `IDEA.md` open item on absolute lifetime is resolved. `.env.example` explains each variable. | Inspection | Not started |
| AC-19 | **Manual browser check.** In a current desktop browser with `docker compose up`: sign in; refresh keeps the shell; a second tab shares the session; signing in from a second browser ends the first browser's session within 2 minutes; sign-out ends the session; with a shortened idle timeout, a closed tab's session ends; the cookie shows `HttpOnly` and `SameSite=Strict` in developer tools; keyboard-only sign-in works; at 320 px the forms reflow without sideways scroll. | Checklist with results and the browser used, recorded in implementation notes by or with the user | Not started |

## Security, privacy, accessibility, and operations

- **Credentials and secrets:** no real secrets anywhere. `.env.example` holds placeholders only, and `.env` stays ignored. The local PostgreSQL password and the development account password are documented placeholders for local use only. CI uses placeholder database credentials in the workflow file, never repository secrets.
- **Data minimization:** only email, password hash, and session metadata are stored. Sign-in attempts keep the normalized email, IP, and time for at most 24 hours.
- **Authorization:** no endpoint accepts a user id; the user always comes from the session. There is no admin route or role.
- **Errors and logging:** sign-in errors are generic and do not reveal whether an account exists. Unexpected errors return a generic 500 without stack traces. Logs record event types (sign-in succeeded or failed, session ended with reason) without credentials or tokens.
- **Abuse limits:** request body size is limited to 10 kB, and password length is capped (AC-4) to bound hashing cost.
- **Production configuration:** `Secure` cookies and an HTTPS origin are enforced at startup (AC-11). The seed cannot run, and the API refuses to start if the development account exists (AC-12). AWS hosting itself is out of scope.
- **Accessibility:** WCAG 2.2 AA via TASK-002 components; labelled fields; errors announced (`role="alert"`) with focus moved to them; status messages use `role="status"`; keyboard-operable; 320 px reflow (AC-19).
- **Operations:** health endpoint for Compose health checks. Migrations apply on API start. The sweep runs in the API process; one API instance is assumed until a deployment task decides otherwise.

## Test strategy

| Criterion | Test level/type | Important cases | Evidence / command |
|---|---|---|---|
| AC-1 | Script runs | Clean `npm ci`; each root script covers both workspaces; dev proxy reaches API | Outputs in notes |
| AC-2 | Integration | Unique email (case-insensitive), one session per user, cascade on user delete | `npm test -w api` |
| AC-3 | Unit | Round trip; wrong password; distinct salts; OWASP defaults; malformed or tampered hash fails safely | `npm test -w api` |
| AC-4 | HTTP integration | Success; case and whitespace in email; unknown email equals wrong password; each 400 case without hashing | `npm test -w api` |
| AC-5 | HTTP integration | Replaced session gets 401; one row; concurrent sign-ins | `npm test -w api` |
| AC-6 | HTTP integration + unit | 9:59 accepted; 10:00 rejected; activity extends; 12-hour limit despite activity; cookie cleared on 401; idle override cannot exceed 10 minutes | `npm test -w api` |
| AC-7 | HTTP integration | No cookie, unknown, ended, expired; repeated requests with the same cookie | `npm test -w api` |
| AC-8 | HTTP integration | Sign-out then 401; idempotent cases; cookie cleared | `npm test -w api` |
| AC-9 | Integration | Each reason runs the cleanup with correct arguments; failing cleanup keeps the token rejected, then the sweep retries; sweep timing with a fake clock | `npm test -w api` |
| AC-10 | HTTP integration | 4 failures allowed, 5th failure then 429 even with correct password; window expiry; IP limit; success clears; survives a new app instance | `npm test -w api` |
| AC-11 | HTTP integration + unit | Cookie attributes in both modes; missing, wrong, and correct Origin; `no-store`; raw token absent from the database; captured logs free of secrets; production startup refusals | `npm test -w api` |
| AC-12 | Integration + unit | Seed allowed only under both conditions; refused cases write nothing; idempotent; production refuses to start if the account exists | `npm test -w api` |
| AC-13 | Component (RTL) + axe | Empty fields; loading and repeat submit; 401, 429, and network errors; focus moves to the error; autocomplete attributes | `npm test -w web` |
| AC-14 | Component (RTL, fake timers) + axe | Session on load; refresh path; 2-minute keep-alive; visibility ping; 401 shows the ended message; sign-out message | `npm test -w web` |
| AC-15 | Component + build check | Reference page at `/design-reference` in development; not in the production bundle | `npm test -w web`; `npm run build` |
| AC-16 | Manual + inspection | Compose up, health checks, seeded sign-in through nginx, published ports, non-root users | Notes |
| AC-17 | Inspection + CI | Steps present; no secrets; GitHub run | Workflow review; user-reported run |
| AC-18 | Inspection | All listed documents updated | Review |
| AC-19 | Manual | Checklist items | Notes, by or with the user |

API tests use an injectable clock, run against a dedicated test database, and reset tables between tests. Web tests mock `fetch`. No test depends on real wall-clock waits.

## Definition of Done

- [ ] Every acceptance criterion is met and supported by evidence.
- [ ] Required tests and checks pass, and the results are recorded.
- [ ] Review findings are resolved or explicitly accepted by the user.
- [ ] Documentation and known limitations are current.
- [ ] The user completes the manual browser check (AC-19).
- [ ] The user accepts closeout; the external CI state is reported accurately.

## Open decisions

None blocking. Decided with the user: [DEC-005](DECISION-LOG.md#dec-005--docker-compose-layout) to [DEC-008](DECISION-LOG.md#dec-008--test-tooling-for-browser-behavior). Proposals approved with this spec (change them if you disagree):

- Opaque random token in an `HttpOnly`, `SameSite=Strict` cookie, with only its SHA-256 hash stored.
- CSRF protection by `SameSite=Strict` plus an `Origin` check on every `POST`.
- Keep-alive by calling the session endpoint every 2 minutes and on tab focus; no separate heartbeat endpoint.
- Sweep every 60 seconds inside the API process.
- Generic error messages listed in AC-4, AC-10, AC-13, and AC-14.
- Seed guard: `NODE_ENV` of `development` or `test` and `ALLOW_DEV_SEED=true`; production startup refuses if the development account exists.
- Signed-in shell content per AC-14; reference page moved to `/design-reference` (development only).
- Vitest for the API (with SWC for decorator metadata), matching the web workspace.
- Local ports: web `127.0.0.1:8080`, API `localhost:3000` (development only), PostgreSQL `127.0.0.1:5432`.

## Revision history

| Revision | Date | Change | User approval |
|---|---|---|---|
| 1 | 2026-11-08 | Initial draft, with DEC-005 to DEC-008 and the proposals under Open decisions | Approved by user, 2026-11-08 |
