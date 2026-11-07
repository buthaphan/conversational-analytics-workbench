# Task review: TASK-002 Design system

**Reviewed revision/diff:** uncommitted working tree on `feature/TASK-002-design-system` (base `381f8ec`), 2026-11-08  
**Spec revision:** 1 (approved 2026-11-08)  
**Method:** Read the spec, plan, decision log, implementation notes, and all changed files. A separate reviewer with no access to the implementation notes read the code against the spec. Every finding below was re-checked against the code or build output before inclusion. Read-only build-output and repository checks were run; tests were not re-run in this review (the implementation's recorded clean-install run is cited instead).  
**Independence caveat:** the implementing agent also compiled this review. The separate code read reduces, but does not remove, that bias.

## Findings

| # | Severity | Finding | Location | Required action / status |
|---|---|---|---|---|
| F1 | **Blocking** | 20 of 47 color swatches on the reference page have no CSS variable to paint with. The swatch background is built at runtime as `` var(--color-${name}) ``, and Tailwind v4 only emits theme variables it finds used in source. Verified: the built CSS defines 27 `--color-*` variables; `brand-navy`, `brand-teal`, `brand-gold`, `accent`, `chart-1..6`, `seq-1..5`, `div-1..5` are missing, so those swatches render without color. Tests only check swatch text, so they pass. Blocks a meaningful AC-13 review and AC-10's "shows every color token". | `web/src/reference/ReferencePage.tsx:76`; `web/src/styles/tokens.css` | Fix before user review. Options: paint swatches from `colors[name]` (simplest), or declare tokens with `@theme static` so every variable is always emitted (also helps future dark mode and non-Tailwind consumers). Add a check that the built CSS defines every declared color variable. |
| F2 | Medium | Pairings used in components but not declared or tested: `fg` on each `*-subtle` alert background (`Alert.tsx:52`), and `accent` on `surface-muted`. Current values pass (estimated well above 4.5:1), but `DESIGN-SYSTEM.md` claims every allowed combination is tested, which is not true. | `web/src/design/tokens.ts:94-102`; `docs/design/DESIGN-SYSTEM.md` | Add the pairings to `colorPairings`. |
| F3 | Medium | Hard-coded color guard is narrower than AC-6's wording. It catches hex and color functions, but not named colors in arbitrary values (`bg-[red]`) or inline styles (`color: "crimson"`). Only `.ts`, `.tsx`, `.css` are scanned. No current violations (only `grid-cols-[8rem_1fr]`, which is not a color). | `web/src/design/colorLiterals.ts:2-3`; `colorLiterals.test.ts:43` | Extend the guard to flag arbitrary color utilities, and record the `logo.svg` exemption. |
| F4 | Medium | Build check misses external URLs that AC-4's "other external CSS/font URLs" covers: `@font-face src:url(https://…)` on an unlisted host, protocol-relative `//host/…`, and external `<script src>`. The current build has none (verified), but a dependency could add one and still pass. | `web/src/design/buildChecks.ts:11-14` | Flag any CSS `url(` starting with `http(s):` or `//`, and any HTML `src`/`href` that does. |
| F5 | Low | `DESIGN-SYSTEM.md` inaccuracies: (a) "dark mode needs no component changes" is false for charts, because `chartTheme.ts` reads hex values once at load; (b) it says `--border-width-strong` is used for the focus outline, but components use `outline-2` and the border-width tokens are defined but unused. | `docs/design/DESIGN-SYSTEM.md`; `web/src/charts/chartTheme.ts` | Correct the doc (charts need theme re-registration for dark mode; describe border tokens accurately or use them). |
| F6 | Low | AC-10 asks for each color's role. The page shows name and value with a group heading ("Text", "Status"), not a per-token role. | `web/src/reference/ReferencePage.tsx:58-84` | Add a short role line per token, or accept the group heading as the role (user decision). |
| F7 | Low | Duplicate chart category labels give duplicate React keys and possible row mix-ups. | `web/src/charts/ChartWithTable.tsx:93` | Key rows by index. |
| F8 | Low | A caller can override the loading semantics: `{...props}` is spread after `aria-busy`/`aria-disabled`, so `aria-busy={false}` removes them. Click blocking still works. | `web/src/components/ui/Button.tsx:62-66` | Spread `props` before the loading attributes. |
| F9 | Low | Chart palette contrast is tested only against `surface`, but the theme background is transparent and the reference page draws on `canvas`. Estimated still at least 3:1. | `web/src/design/chartPalette.test.ts` | Also test against `canvas`. |
| F10 | Low | Weak or missing test cases: the Button variant class regex accepts almost any variant; the loading button is tested with mouse clicks only (not Enter/Space); `cn` does not cover hyphenated sizes such as `text-body-sm` with `text-fg`. | `Button.test.tsx:21`, `Button.test.tsx` loading block, `cn.test.ts` | Tighten the variant assertion per variant; add a keyboard case; add the hyphenated-size case. |
| F11 | Low | Token parser reads commented-out declarations, so a commented `--color-…` would be parsed or cause a false "duplicate" error. | `web/src/design/tokens.ts:6,24` | Strip CSS comments before parsing. |
| S1 | Suggestion | CI: pin actions by commit SHA and set `persist-credentials: false` on checkout. | `.github/workflows/ci.yml` | Optional hardening. |
| S2 | Suggestion | `Table` always adds a tab stop, even when it does not scroll; this lengthens the AC-9 tab order. | `web/src/components/ui/Table.tsx` | Consider making it focusable only when it overflows. |
| S3 | Suggestion | The production JS contains the whole raw `tokens.css` (comments included) through the `?raw` import. Harmless; slightly larger bundle. | `web/src/design/tokens.ts:1` | Optional. |

## Acceptance criteria

| Criterion | Status | Evidence or gap |
|---|---|---|
| AC-1 | met | Recorded clean-install run in `03-implementation-notes.md` (all scripts exit 0; dev server HTTP 200). Root workspaces `["web"]` inspected. |
| AC-2 | met | `tokens.css` and `tokens.test.ts` (required roles, exact brand values); Tailwind defaults removed. |
| AC-3 | met | All declared pairings tested and passing; helper validated against known values; brand teal/gold never used as text. Gap in coverage of actually used pairings is F2. |
| AC-4 | met | Font `.woff2` files in `web/dist/assets`; no external hosts in the current build (re-checked); type scale tests; `tabular-nums` on numeric cells. Check robustness is F4. |
| AC-5 | met | Tokens and `themeTokens.test.ts`; documented. (Border-width doc accuracy is F5.) |
| AC-6 | met | Guard passes and no current violations found by review. Guard scope is F3. |
| AC-7 | met | Component behavior/ARIA tests and axe per state. F8 and F10 are hardening. |
| AC-8 | met | Palette thresholds, theme-from-tokens, and table-equals-data tests. |
| AC-9 | **unverified** | Manual checklist not yet completed by the user. |
| AC-10 | **unmet** | 20 swatches render without color (F1); role per token missing (F6). Production exclusion verified: the production JS contains no reference-page marker, "Design reference" text, or ECharts. |
| AC-11 | met (GitHub run unverified) | Workflow inspected: Node from `.nvmrc`, `npm ci`, format, lint, typecheck, test, build; `contents: read`; no secrets, AWS, Docker, or deploy. Not run on GitHub until the user pushes. |
| AC-12 | **unmet** | Document exists and covers all required topics, but contains inaccurate claims (F2, F5). |
| AC-13 | **unverified** | User visual approval pending; F1 must be fixed first. |

## Tests and quality

Tests were written first and cover meaningful behavior: contrast math with known values, a deliberate failing-pair case, palette distinguishability under simulated color-vision deficiencies, ARIA wiring, and a real red/green on the production build check. No tests were weakened to pass. The one timing change (`App.test.tsx`) widens a wait without changing the assertion, and the axe `color-contrast` exclusion is justified and documented. The main blind spot is visual: the simulated DOM cannot see whether CSS variables exist (F1). The build-output check is the natural place to close that.

## Security/privacy-relevant review

- No secrets, `.env` files, or credentials (checked). `web/dist` and `node_modules` are git-ignored; `package-lock.json` is tracked.
- No runtime requests to external font or CSS hosts in the current build (checked); detection gaps in F4.
- The reference page is excluded from production (checked).
- CI is read-only with no credentials. S1 is optional hardening.
- Dependency audit: 10 moderate findings in development lint tooling only, accepted by the user (DEC-004); runtime dependencies have none.

## Resolution status (updated after implementation pass 2, 2026-11-08)

F1–F11 are reported fixed with test evidence in [03-implementation-notes.md](03-implementation-notes.md#review-fixes-implementation-pass-2-2026-11-08). S1–S3 were not in scope and remain open suggestions. These fixes have **not yet been re-reviewed**; run `/task-review` again to confirm them and update the criteria table above.

## Recommendation (original)

**Return to implementation** for F1 (blocking), then F2–F5 (small, documentation and guard accuracy). F6–F11 are low and cheap; recommend fixing them in the same pass unless the user prefers to defer them. After the fixes, the user completes AC-9 and AC-13, then closeout. No requirement appears infeasible or ambiguous, so no decision-log entry is needed. F6 (role per token) is the only item where the user may choose to accept the current design instead.
