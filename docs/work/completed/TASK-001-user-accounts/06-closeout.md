# Closeout: TASK-001 User accounts and sign-in

**Status:** Accepted by the user on 2026-11-08. External CI passed.  
**Spec revision:** 1 (approved 2026-11-08)  
**Branch:** `feature/TASK-001-user-accounts`, pushed to the private repository. Implementation `1e132c5`; review fixes `a34e8ad` (round 1), `cb4fc57` (round 2), `7f507e8` (round 3). The user's own untracked `docs/product/…txt` is outside this task.

## Definition of Done

| Criterion | Status | Evidence |
|---|---|---|
| AC-1 Workspaces and scripts | Met | Clean-install run (all root scripts exit 0 for `web` and `api`); development mode verified through the Vite proxy, including after the API was bound to `127.0.0.1` |
| AC-2 Data model | Met | Prisma migration with a lowercase-email CHECK; `schema.test.ts` |
| AC-3 Password hashing | Met | scrypt with OWASP defaults; malformed or unsafe stored hashes fail safely (`isSafeScryptParams`, review R3) |
| AC-4 Sign-in | Met | Generic 401s, dummy check for unknown emails, validation (including the 254/255 boundary) |
| AC-5 One session per user | Met | Replaced-session, concurrent sign-in (all 200), and cleanup-failure tests; live probe of 3 simultaneous sign-ins |
| AC-6 Session lifetime | Met | 10-minute idle and 12-hour limits with a fake clock; cookie cleared on 401 |
| AC-7 Current session and refresh | Met | HTTP tests |
| AC-8 Sign-out | Met | HTTP tests (idempotent) |
| AC-9 Session-end cleanup point | Met | One transaction under a row lock; failed cleanup keeps the token rejected and the sweep retries; cleanup runs exactly once under concurrency |
| AC-10 Rate limiting | Met | Reserve-before-check design (review R1): simultaneous tests (at most 5 per email, 20 per IP) and a live probe (30 simultaneous guesses: 4 × 401, 26 × 429); window, `Retry-After`, and restart tests |
| AC-11 Cookie, CSRF, response security | Met | Origin check, cookie attributes in both modes, `no-store`, body limit, secret-free logs (proven by a mutation check), hash-only token storage, production startup refusals; development IP spoofing closed (R4) |
| AC-12 Development seed and guards | Met | Seed refuses outside development/test without `ALLOW_DEV_SEED=true`; production refuses to start with the development account |
| AC-13 Sign-in screen | Met | Component tests with axe for every state |
| AC-14 Signed-in shell and session end | Met | Keep-alive, visibility check, session-ended and signed-out messages; late-reply edge cases fixed (R5, N1, N2, N3) |
| AC-15 Design reference stays development-only | Met | `/design-reference` in development; `check:build` |
| AC-16 Docker Compose | Met | All services healthy; non-root containers; ports bound to `127.0.0.1`; sign-in through nginx |
| AC-17 CI | Met | GitHub Actions passed for `1e132c5`, `a34e8ad`, `cb4fc57`, and `7f507e8` (reported by the user) |
| AC-18 Documentation | Met | README, `PROJECT-SETUP.md`, auth `IDEA.md`, commented `example.env` |
| AC-19 Manual browser check | Met, with one item accepted | User, Chrome, 2026-11-08: 8 of 9 items passed; item 7 (closed tab after a shortened idle timeout) accepted on automated evidence ([DEC-009](DECISION-LOG.md#dec-009--ac-19-idle-timeout-manual-check)) |

Spec Definition of Done:

- [x] Every acceptance criterion is met and supported by evidence.
- [x] Required tests and checks pass, and the results are recorded.
- [x] Review findings are resolved or explicitly accepted by the user.
- [x] Documentation and known limitations are current.
- [x] The user completed the manual browser check (AC-19), with item 7 accepted under DEC-009.
- [x] The user accepts closeout (2026-11-08); the external CI state is reported accurately (passed).

## Verification and review

- **Final checks** (2026-11-08):
  - **API:** 140 tests passed on every run (13 files).
  - **Web:** 291 tests plus 1 deliberately failing self-test passed, 3 consecutive runs (23 files).
  - **Format, lint, typecheck, and both builds** exit 0.
  - **Dependency audit:** runtime 0; development-only `minimatch` advisory as accepted in TASK-002 DEC-004.
- **Task review:** three rounds ([05-task-review.md](05-task-review.md)). A separate reviewer read the code without the implementation notes in each round.
  - **Round 1:** R1 was blocking (the rate limit was bypassed by simultaneous requests, measured live), plus R2 to R5. All fixed.
  - **Round 2:** all round-1 fixes confirmed; new low findings N1 and N2. Both fixed.
  - **Round 3:** N1 and N2 confirmed; new low finding N3. Fixed in `7f507e8`. It was confirmed in code (`enterState` resets `signingOut`) and by its test, which failed first with `aria-busy="true"`. It was not given a fourth independent review because the change is one line.
  - **Unresolved:** none. Suggestions S3 and S4 are listed below.
- **External CI:** passed for the final commit `7f507e8` (reported by the user).

## Limitations and pending decisions

- **Pending decisions:** none. DEC-001 to DEC-009 are approved.
- **Accepted gap:** AC-19 item 7 relies on automated evidence (DEC-009).
- **Dev-only audit finding:** `minimatch` via ESLint 10 (TASK-002 DEC-004).
- **TASK-003 handover (review S1):**
  - Analysis tables need an `ON DELETE CASCADE` from `users` as well as from `auth_sessions`. User deletion bypasses the cleanup point.
  - Register a cleanup step with `SessionCleanupRegistry`.
  - Cleanup runs in a Prisma interactive transaction with the default 5-second timeout, so keep it fast or set a timeout explicitly.
- **Suggestions (not required):**
  - S3: in Compose, all local browsers share one IP counter (the Docker gateway); revisit client-IP handling for AWS.
  - S4: no Content-Security-Policy yet (add with the deployment task); the API tests take about a minute.
- **Operational notes:**
  - Open the Compose stack at exactly `http://127.0.0.1:8080` (`localhost` is refused by the Origin check).
  - The settings template is `example.env`, because the project's permission rules block `.env.*` files.
  - The sweep assumes one API instance.

## Workflow friction (actionable only)

- **Security limits need concurrency tests from the start.** The rate limit passed every one-at-a-time test but failed against 30 simultaneous requests. Action: for any limit or "at most one" rule, the spec's test plan should include a simultaneous-request case.
- **Each review round found a new edge case in the same component** (`AuthApp`: R5, then N1 and N2, then N3). Action: when fixing a state race, test every state transition that the fix touches, including that each control is still usable, not only that it is present.
- **Time-dependent tests:** two tests became slow or timed out under machine load because they ran real full-strength scrypt. Action: keep real cryptographic cost only in the tests about it; stub it where only counts matter.
- **Self-reported claims:** while presenting the N2 fix, I said the Sign out button was not left busy, and round 3 proved that wrong. Action: state behavior claims only after a test or a trace shows them.

## User acceptance

- Accepted by: buthaphan
- Date: 2026-11-08
- External CI result: Passed for `7f507e8` (2026-11-08)
- Notes: Suggestions S3 and S4 and the TASK-003 handover remain open for later tasks. Next: merge `feature/TASK-001-user-accounts` into `main` through a pull request, then progress the conversational-analytics idea (TASK-003).
