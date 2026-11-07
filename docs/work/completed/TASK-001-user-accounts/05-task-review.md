# Task review: TASK-001 User accounts and sign-in

This file keeps every review round. **Round 3 (current) is at the end.**

---

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

---

# Review round 2

**Reviewed revision:** `a34e8ad` (fixes for round 1), diffed against `d9664b3`. Reviewed 2026-11-08.

**Method:**
- The same separate reviewer re-read the round-1 fixes and the changed files, again without access to the implementation notes.
- I re-checked its findings against the code (`AuthApp.tsx:44`, `:74`, `:77`).
- Re-ran `npm test`: web 289 passed plus 1 expected fail; API 140 passed; exit 0. Working tree clean apart from the user's own untracked `docs/product/…txt`.
- Live checks:
  - **Rate limit, through nginx after the rebuild** (recorded by implementation and consistent with the code): 30 simultaneous wrong guesses gave 4 × 401 and 26 × 429.
  - **Development mode, done in this review:** the built API and `npm run dev` gave health 200, sign-in 200, session 200, and sign-out 204 through the Vite proxy. The API was listening only on `127.0.0.1:3000` (netstat). A failed sign-in sent with `X-Forwarded-For: 203.0.113.9` was recorded with client IP `127.0.0.1`.

## Round-1 findings: re-verification

| # | Status | Evidence |
|---|---|---|
| R1 rate-limit race (blocking) | **Fixed** | `RateLimiter.reserve` inserts the attempt, then counts including it, and proceeds only within the limit (`rate-limiter.ts`, `auth.service.ts`). Reasoning checked under READ COMMITTED: of any two requests that pass, the one that counts later sees the other's row, so at most 5 per email (20 per IP) can pass. A blocked request deletes only its own row; the IP count spans all emails. Tests: 30 simultaneous (real `verify`) allow at most 5 checks; 40 simultaneous from one IP allow at most 20; blocked attempts do not extend the block. The live probe agrees. A burst may block more than strictly needed (safe). Stubbing the dummy check in the rate-limit tests does not weaken AC-10 (it counts attempts), and AC-4's dummy-check test in `auth.http.test.ts` is unstubbed. |
| R2 weak tests | **Fixed** | Concurrent sign-ins must all return 200 with a cookie; malformed-hash cases carry a valid salt and key; the 254/255 boundary is tested directly; the fetch mock fails tests on unlisted requests (proven by `it.fails`) |
| R3 hash parsing | **Fixed** | `isSafeScryptParams` (whole numbers, N a power of two, p ≤ 16, 128·N·r ≤ 256 MiB); `verifyPassword` returns `false` on any `scrypt` error; NaN cases were red first |
| R4 dev IP spoofing | **Fixed** | Vite proxy strips `X-Forwarded-For`; API listens on `127.0.0.1` by default; the image sets `0.0.0.0`. Verified live (above), including the `localhost`→IPv4 fallback the reviewer flagged as untested. |
| R5 late keep-alive | **Fixed** (reported cases) | Generation counter; both race tests were red first. Two remaining paths are N1 and N2 below. |
| S2 cleanup-failure sign-in | **Covered** | `cleanup-failure.http.test.ts`: generic 500, no new cookie, old token rejected, one row marked `replaced`, sign-in works after the sweep |
| S1, S3, S4 | Recorded | S1 (TASK-003 handover) is in the notes; S3 (shared IP counter in Compose) and S4 (CSP, test speed) remain suggestions |

## Findings (round 2)

| # | Severity | Finding | Location | Required action |
|---|---|---|---|---|
| N1 | Low | **A stale "Could not sign out. Try again." can reappear after the next sign-in.** `signOutFailed` is reset only when a new sign-out starts (`:74`), not when the app changes state. Scenario: sign-out fails (network); a keep-alive then gets 401 and shows the sign-in screen; after signing in again, the shell still shows the old error. This bug predates round 1 but was not reported then. | `web/src/auth/AuthApp.tsx:25`, `:44`, `:74-78` | Reset `signOutFailed` in `enterState`, with a test. |
| N2 | Low | **A late sign-out reply can hide a new session.** The sign-out result is applied without the generation check (`:77`). Scenario: sign-out hangs; a keep-alive 401 shows the sign-in screen; the user signs in again; the old sign-out then returns OK and shows the sign-in screen, although the new server session is valid. The timing is unlikely, and a refresh restores the shell. | `web/src/auth/AuthApp.tsx:77` | Capture the generation before `signOut()` and ignore the result if it changed, with a test. |
| — | Note | The concurrent rate-limit tests check upper bounds only, so a version that blocked everything would also pass them. The sequential tests ("allows sign-in after 4 failures", "lifts the block…") cover the lower bound. | `rate-limit.http.test.ts` | None required. |

No blocking defects. No security issue remains open in scope.

## Acceptance criteria (round 2)

| Criterion | Status | Evidence or gap |
|---|---|---|
| AC-1 | met | Tests re-run (exit 0); development mode verified live through the Vite proxy with the new `127.0.0.1` binding |
| AC-2 | met | Unchanged since round 1 |
| AC-3 | met | R3 fixed and tested |
| AC-4 | met | 254/255 boundary tested directly; dummy check still proven |
| AC-5 | met | Concurrent test now requires all 200s; replaced-session and cleanup-failure (S2) tests |
| AC-6 to AC-9 | met | Unchanged; S2 adds evidence for AC-9 |
| AC-10 | met | R1 fixed: simultaneous tests and live probe; sequential window and `Retry-After` tests unchanged |
| AC-11 | met | Unchanged, plus R4 closes development-mode IP spoofing |
| AC-12, AC-13 | met | Unchanged |
| AC-14 | met | R5 fixed. N1 and N2 are low-severity edge cases in the same component; they do not contradict AC-14's stated behavior. |
| AC-15, AC-16, AC-18 | met | Unchanged; Compose rebuilt and healthy after the fixes |
| AC-17 | met | Unchanged workflow; the GitHub run for `a34e8ad` was not yet reported when this review was written. The previous run (`1e132c5`) passed. |
| AC-19 | **unverified** (1 item) | 8 of 9 passed (user, Chrome). Item 7 (closed tab ends after a shortened idle timeout) was skipped. **User decision:** run it, or accept the automated evidence (AC-6, AC-9). |

## Recommendation (round 2)

**Pending user decision, then closeout.** Nothing blocks the task. Before closeout the user decides:
1. **N1 and N2:** fix them now (a small `/implementation` pass with tests, then a short re-check), or accept them as known low-severity limitations.
2. **AC-19 item 7:** run the 5-minute manual check, or accept the automated evidence.
3. **CI:** report the GitHub Actions result for `a34e8ad`.

No requirement appears infeasible or ambiguous, so no decision-log entry is needed.

**Outcome (recorded in round 3):**
- The user chose to fix N1 and N2.
- The user accepted AC-19 item 7 on automated evidence (DEC-009).
- The user reported CI passing for `a34e8ad`.

---

# Review round 3

**Reviewed revision:** `cb4fc57` (fixes for N1 and N2; also records DEC-009 and the CI result). Reviewed 2026-11-08.

**Method:**
- Read the code diff (5 lines in `AuthApp.tsx`) and the two new tests.
- The same separate reviewer re-checked the change, again without the implementation notes.
- Re-ran `npm test`: web 291 passed plus 1 expected fail; API 140 passed; exit 0.
- Branch pushed and in sync; only the user's own untracked `docs/product/…txt` is outside Git.

## Round-2 findings: re-verification

| # | Status | Evidence |
|---|---|---|
| N1 stale sign-out error | **Fixed** | `enterState` clears `signOutFailed` (`AuthApp.tsx:47`), and every signed-in/signed-out transition goes through `enterState`. The new test fails against the previous code (the error stayed `true` across the keep-alive 401 and the new sign-in). |
| N2 late sign-out reply | **Fixed for the reported effect** | `handleSignOut` captures the generation and ignores a reply from an earlier state (`AuthApp.tsx:77-81`). A late success no longer replaces the new session's shell, and a late failure no longer shows a stale error. The new test fails against the previous code. A remaining side effect is N3. |
| Regressions | None found | A normal sign-out still shows "You have signed out." (generation unchanged; covered by "stops keep-alive requests after signing out"). A failed sign-out without a race still shows its error. The initial session check is unaffected. |

## Findings (round 3)

| # | Severity | Finding | Location | Required action |
|---|---|---|---|---|
| N3 | Low | **In the N2 situation, the new session's Sign out button stays busy until the old sign-out request finishes.** `signingOut` is set before the request (`:75`) and cleared only after the reply (`:79`); `enterState` does not reset it. If the user signs in again while an old sign-out request is still pending, the new shell's **Sign out** button shows as loading, and `Button` ignores clicks while loading (`Button.tsx:53`). Requests have no timeout, so the user may be unable to sign out of the new session until the stale request settles. The N2 test checks that the button is present, not that it is usable. (I said otherwise when presenting the change; the reviewer's reading is correct.) | `web/src/auth/AuthApp.tsx:24`, `:75-79`, `:112`; `web/src/components/ui/Button.tsx:53` | Add `setSigningOut(false)` to `enterState`, and extend the N2 test to assert that the new **Sign out** button is not busy (for example `aria-busy` is not `true`). |

No blocking defects.

## Acceptance criteria (round 3)

| Criterion | Status | Evidence or gap |
|---|---|---|
| AC-1 to AC-13 | met | Unchanged since round 2; tests re-run |
| AC-14 | met | N1 and N2 fixed. N3 is a low-severity edge case (a user who signs in again during a stalled sign-out cannot sign out until it settles); it does not contradict AC-14's stated behavior. |
| AC-15 to AC-18 | met | Unchanged; CI for `a34e8ad` reported passing by the user. The run for `cb4fc57` has not been reported yet. |
| AC-19 | met | 8 of 9 items passed (user, Chrome); item 7 accepted on automated evidence by the user (DEC-009) |

## Recommendation (round 3)

**Pending user decision, then closeout.** Nothing blocks the task. The user decides N3:
- **Fix it:** a one-line change plus one extra assertion in the existing N2 test, then a quick re-check. Recommended, because it completes the N2 fix.
- **Accept it** as a known low-severity limitation, recorded in the closeout.

Also report the CI result for `cb4fc57` (or the commit that contains an N3 fix). No requirement appears infeasible or ambiguous, so no decision-log entry is needed.

**Outcome (2026-11-08):**
- The user chose to fix N3 and reported CI passing for `cb4fc57`.
- **Fix:** `enterState` now also resets `signingOut`.
- **Test:** the N2 test now asserts that the new session's **Sign out** button is not busy while the old request is pending. It failed first with `aria-busy="true"`.
- **Verification:** web 291 passed plus 1 expected fail, 3 runs; build, format, lint, and typecheck clean ([03-implementation-notes.md](03-implementation-notes.md), pass 4).
- **Not yet independently re-checked:** the change is a one-line state reset with a test that went red first. Closeout should confirm it and record CI for the commit that contains it.
