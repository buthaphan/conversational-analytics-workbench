# Task review: TASK-001 User accounts and sign-in

**Review round:** 1  
**Reviewed revision:** `1e132c5` on `feature/TASK-001-user-accounts` (base `93d8d5a`), plus the uncommitted CI-result note in `03-implementation-notes.md`. Reviewed 2026-11-08.  
**Spec revision:** 1 (approved 2026-11-08)

**Method:**
- Read the spec, plan, decision log, implementation notes, and security baseline.
- A separate reviewer read all API, web, container, and CI code and tests against the spec, without access to the implementation notes. I re-checked every finding against the code before including it.
- Re-ran `npm test` for both workspaces: web 284/284, API 118/118, exit 0.
- Probed the running local Compose stack (`http://127.0.0.1:8080`) with simultaneous requests to measure the rate-limit and concurrent sign-in behavior.
- The CI result is as reported by the user.

**Independence caveat:** the same agent family implemented and reviewed this task. The separate code read and the live probes reduce, but do not remove, that bias.

**Side effects of the probes (local only):**
- About 45 failed sign-in attempts for random `probe-…@example.test` addresses were recorded in the development database; the sweep deletes them after 24 hours.
- Three test sign-ins replaced any open development session for `user@example.test`.

## Findings

| # | Severity | Finding | Location | Required action |
|---|---|---|---|---|
| R1 | **Blocking** | **The rate limit can be bypassed with simultaneous requests.** Sign-in checks the failure count, then runs the password check (scrypt, about 0.25 s), and only then records the failure. Nothing serializes these steps. **Measured:** 30 simultaneous wrong passwords for one email were all checked; all 30 returned 401 and none 429, although the limit is 5. The per-IP limit has the same race. Each in-flight check also uses about 128 MiB, so a burst also strains memory. AC-10 is therefore not met, and no test covers concurrent attempts. | `api/src/auth/auth.service.ts:44-56`, `api/src/auth/rate-limiter.ts:20-40` | Make "count, then record" atomic per email and per IP. One option: record the attempt before the password check, then count including it, and delete it on success. Another: a PostgreSQL advisory lock per email and per IP. Add a test that sends simultaneous attempts and expects at most 5 password checks for one email. |
| R2 | Medium | **Tests that would pass even if the behavior broke.** (a) The concurrent sign-in test (AC-5) drops responses without a cookie via `filter(Boolean)`, so 500s from the losing requests would go unnoticed. The behavior itself is correct: a live probe of 3 simultaneous sign-ins returned 200, 200, 200. (b) In the malformed-hash cases (AC-3), "cost not a power of two" and "oversized cost" use a 3-byte key, so the key-length check rejects them before the N checks run. (c) The "email over 254 characters" case (AC-4) uses a 250-character local part, which the email validator already rejects at 64, so `@MaxLength(254)` is never exercised. (d) The web fetch mock's "unexpected request fails the test" becomes a network-error path in `api.ts`, so only call-count assertions catch unexpected requests. | `api/src/auth/auth.http.test.ts:130`, `:83`; `api/src/auth/password.test.ts:39-40`; `web/src/test/fetch.ts:15` | (a) Assert that all concurrent sign-ins return 200. (b) Give these cases a valid 16-byte salt and 64-byte key so the parameter checks are what reject them. (c) Use an email with a valid local part and a domain long enough to exceed 254 characters. (d) Optional: record unexpected requests and fail in `afterEach`. |
| R3 | Low | **A malformed stored hash can make sign-in fail with 500 instead of a normal rejection.** `/^\d+$/` maps non-numeric `r` or `p` to `NaN`, and `NaN` passes `r < 1 \|\| r > MAX_R`. `scrypt` then throws, so `verifyPassword` raises instead of returning `false`, against AC-3's "malformed hash rejected". The bounds also allow N=2^20 with r=32 (about 4 GiB), which contradicts the comment that they prevent memory exhaustion. Stored hashes are server-written, so practical risk is low. | `api/src/auth/password.ts:49-52` | Reject non-finite values explicitly. Cap memory (`128 * N * r`) rather than N and r separately. Have `verifyPassword` return `false` on any `scrypt` error. Add the missing test cases. |
| R4 | Low | **In npm development mode the client IP can be spoofed.** Vite's proxy forwards a browser-supplied `X-Forwarded-For` unchanged, and the API trusts loopback proxies, so the per-IP limit can be evaded with a new fake address on each request. In npm development the API also listens on all network interfaces. Compose is safe, because nginx replaces the header. | `web/vite.config.ts:12`, `api/src/app.ts:19`, `api/src/main.ts` | Strip or overwrite `X-Forwarded-For` in the Vite proxy (`configure` hook). Optionally bind the API to `127.0.0.1` outside containers. |
| R5 | Low | **A late keep-alive 401 can overwrite newer state.** `keepAlive` sets "session ended" without checking what the app is currently showing. Two cases: a keep-alive in flight during sign-out replaces "You have signed out." with "Your session has ended."; a very slow 401 from before a new sign-in could send the newly signed-in user back to the sign-in screen. | `web/src/auth/AuthApp.tsx:42-48` | Apply the result only if the app is still signed in, for example with a functional state update or a request generation counter. |
| S1 | Suggestion | **Deleting a user bypasses the cleanup point.** The database cascade deletes the sessions directly, so registered cleanup steps never run. Interactive Prisma transactions also time out after 5 seconds, so a slow TASK-003 cleanup step would fail on every retry. | `api/prisma/migrations/…/migration.sql:57`, `api/src/sessions/session.store.ts` | TASK-003 handover: give analysis tables a cascade from `users` as well, keep cleanup steps fast, or set an explicit transaction timeout. Record this in the notes. |
| S2 | Suggestion | **A cleanup failure blocks sign-in, and this path is untested.** When the previous session's cleanup keeps failing, sign-in retries 5 times and then returns a generic 500. The notes document this, but no test covers it. | `api/src/sessions/session.store.ts:47-71` | Add a test for it. |
| S3 | Suggestion | **In Compose, all local browsers probably share one IP counter** (the Docker gateway address). | `compose.yaml`, `web/nginx.conf` | Revisit client-IP handling in the AWS deployment task. |
| S4 | Suggestion | Already listed in the notes: no Content-Security-Policy yet, and the API test suite takes about 60–80 s (real scrypt). | — | Optional follow-ups. |

## Acceptance criteria

| Criterion | Status | Evidence or gap |
|---|---|---|
| AC-1 | met | Clean-install verification recorded in the notes; tests re-run in this review (402 pass); dev-proxy run recorded; workspaces `["web", "api"]` |
| AC-2 | met | `schema.test.ts`; lowercase CHECK in the migration (inspected) |
| AC-3 | **unmet** (minor) | A non-numeric `r` or `p` makes verification throw instead of failing (R3); two malformed cases never reach their checks (R2b) |
| AC-4 | met | HTTP tests for success, generic 401, dummy verification, and 400s. The 254-character case is weakly exercised (R2c). |
| AC-5 | met | Replaced-session test; live probe of 3 simultaneous sign-ins returned 200, 200, 200 with one valid session. The test is weaker than it looks (R2a). |
| AC-6 | met | Store and HTTP fake-clock boundary tests; sweep uses the same boundaries (reviewer confirmed) |
| AC-7 | met | HTTP tests |
| AC-8 | met | HTTP tests |
| AC-9 | met | Mark-ended, then cleanup and delete in one transaction under a row lock; failure keeps the token rejected; sweep retries; 60-second schedule tested. User deletion bypasses cleanup (S1, out of AC-9's scope). |
| AC-10 | **unmet** | Bypassed by simultaneous requests (R1, measured) |
| AC-11 | met | Origin, cookie (both modes), `no-store`, body limit, log capture (shown to catch a leak by a mutation check), raw token absent, production startup refusals. Development-mode IP spoofing is R4. |
| AC-12 | met | Seed tests (six refusal cases write nothing), CLI exit codes, production guard |
| AC-13 | met | Component tests with axe for every state |
| AC-14 | met | Component tests with fake timers. The late-401 race is R5. |
| AC-15 | met | App test; `check:build` |
| AC-16 | met | Compose run recorded in the notes. The three containers were healthy during this review, and the live probes went through nginx. Non-root users and ports confirmed by inspection. |
| AC-17 | met | Workflow inspected (`contents: read`, no secrets, PostgreSQL service, image builds without pushing); GitHub run at `1e132c5` reported passing by the user |
| AC-18 | met | Documents inspected |
| AC-19 | **unverified** (1 item) | 8 of 9 items passed (user, Chrome). Item 7 (closed tab ends after a shortened idle timeout) was skipped. Automated tests cover the logic, but not real browser behavior. **User decision:** run item 7 or accept the gap. |

## Tests and quality

- Tests were written first, with recorded red steps, and none were weakened to get a pass.
- Earlier weaknesses were caught and fixed during implementation: a vacuous log test, now proven by a mutation check; a concurrency defect, found by a test that then went red; and slow tests, given an explicit timeout.
- Remaining gaps are listed in R2. The biggest one in practice is the lack of any concurrency test for rate limiting (R1).
- Simplicity: modules are small and focused; no concerns.

## Security/privacy-relevant review

- **Secrets:** none in tracked files. `.env` and local settings are ignored; placeholders only; CI uses placeholder database credentials; no tokens in logs (tested); only token hashes are stored (tested).
- **Authorization:** every user comes from the session; there are no admin routes.
- **Brute-force protection:** **weak under concurrency** (R1). This is the main security issue.
- **Containers:** non-root API and nginx, ports bound to `127.0.0.1`, API not published, `.dockerignore` excludes secrets.
- **Dependencies:** runtime audit 0; development-only `minimatch` advisory as accepted in TASK-002 DEC-004.

## Recommendation

**Return to implementation** for R1 (blocking: AC-10). Fix R2 and R3 in the same pass, since they are small and make AC-3, AC-4, and AC-5 evidence sound. R4 and R5 are cheap and recommended. S1 to S4 can be recorded as follow-ups.

After the fixes:
1. Run `/task-review` again.
2. The user decides AC-19 item 7 (run the 5-minute check, or accept automated evidence only).
3. Closeout.

No requirement appears infeasible or ambiguous, so no decision-log entry is needed.
