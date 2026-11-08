# Conversational Analytics Workbench

![Conversational Analytics Workbench logo](assets/brand/logo.svg)

**Ask your data. See the evidence.**

A portfolio showcase for exploring business data with natural-language questions. The assistant selects from ten approved data capabilities; the application validates requests and performs calculations; charts and tables present the verified results. Users can ask follow-up questions against the active result set and must confirm before switching to a different data scope.

## Current stage

- **TASK-002 (design system):** complete. The design tokens, components, and chart theme are in `web/`.
- **TASK-001 (user accounts and sign-in):** complete. The NestJS API (`api/`), PostgreSQL, sign-in and sign-out with server-side sessions, and Docker Compose.
- **TASK-003 (conversational workflow):** complete. The analysis workspace, the backend rules that decide what each question may do, and a development demo model, all without cloud credentials ([architecture proposal](docs/ideas/2026-11-08-conversational-analytics/ARCHITECTURE-PROPOSAL.md)).
- **TASK-004 (real data and AI adapters):** in progress. BigQuery (TheLook) and Claude Sonnet 5.5 behind the same workflow ([task records](docs/work/active/TASK-004-data-and-ai-adapters/)).

See `docs/PROJECT-SETUP.md` for decisions and open items, and `docs/work/` for task records.

## Run locally

You need Node 24 (see `.nvmrc`) and Docker Desktop.

1. Copy the settings template: `cp example.env .env`. All values are local placeholders.
2. Install dependencies: `npm ci`.

**Whole stack in Docker** (closest to the showcase):

```bash
docker compose up --build -d
docker compose exec api node dist/seed/seed-cli.js   # creates the local account
```

Open **http://127.0.0.1:8080**, using exactly this address: `localhost` is a different origin and sign-in will be refused. Sign in as `user@example.test` with the local development password from `docs/PROJECT-SETUP.md`.

**Day-to-day development** (instant reload):

```bash
docker compose up -d postgres         # database only
npm run db:deploy -w api              # apply migrations
npm run db:seed -w api                # local account
npm run dev -w api                    # API on http://localhost:3000
npm run dev                           # web on http://localhost:5173 (proxies /api)
```

The design reference page is at http://localhost:5173/design-reference (development only).

## The analysis workspace

After signing in, the workspace shows the conversation, the active result (a bar chart with its table, or a table), a summary of its scope, and analysis figures with the rows they are based on.

- **How a question is handled:** a model reads the question and proposes one structured decision (refine, analyse, change the view, load data, confirm a switch, ask a question, or reply). The API checks that decision against the stored result and decides what actually happens. Every figure comes from the API, computed from the stored rows; the model never sees the rows or the figures.
- **Switching data:** loading a different capability or period replaces the current result, so the workspace asks first (**Switch** or **Keep current**).
- **One turn at a time:** while a question is being answered, a second message gets a "still answering" reply, and a refreshed page shows a notice until the answer arrives. Signing out never waits for a slow answer.

**Model and data.** Two settings in `.env` choose them:

|                  | Development default (no credentials, no cost)                                                       | Real                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `ANALYSIS_MODEL` | `demo`: recognises a fixed list of example questions (shown as buttons under a "Demo mode" banner)  | `claude`: Claude Sonnet 5.5 via the Anthropic API      |
| `DATA_SOURCE`    | `fixture`: a deterministic synthetic set shaped like TheLook (about 400 customers and 120 products) | `bigquery`: Google's public, synthetic TheLook dataset |

Production refuses `demo` and `fixture`. Docker Compose uses the development defaults; run the real adapters with the npm dev servers.

**Using the real adapters** (each needs your own account; the keys stay outside this repository):

- **BigQuery:** create a Google Cloud project with the BigQuery API enabled (the free Sandbox is enough), run `gcloud auth application-default login` (the credentials file stays in your user profile), and set `DATA_SOURCE=bigquery` and `GOOGLE_CLOUD_PROJECT=<project id>` in `.env`. Each question that loads data scans about 10 MB, well inside the Sandbox's free monthly allowance; every query is capped at 1 GB.
- **Claude:** create an API key in the Anthropic Console, set a spend limit there (or keep prepaid credit with auto-reload off), and set `ANALYSIS_MODEL=claude` and `ANTHROPIC_API_KEY=<key>` in `.env`. A turn costs about $0.0025 and takes about 2 s (measured, see below).

**Live checks** (never part of `npm test` or CI; each skips without its credentials):

- `npm run live:profile -w api`: profiles TheLook (free). Results: [docs/product/THELOOK-PROFILE.md](docs/product/THELOOK-PROFILE.md).
- `npm run live:test -w api`: known-answer check. The BigQuery queries must match the reference calculation rules exactly (free).
- `npm run live:eval -w api`: 37 model decision cases, about $0.09 per run. Passes at 90% overall and 100% of the safety cases. `EVAL_SAVE_BASELINE=1` stores the result in `api/src/live/eval/`, the baseline for comparing models later (`ANTHROPIC_MODEL` selects another model).

**Checks:** `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test` (API tests need the database running), and `npm run build`.

The local account and its weak password exist for local development and tests only. The seed refuses to run outside them, and the API refuses to start in production if that account exists.

## Agreed product boundaries

- One-page analytics app; all signed-in users have the same ordinary-user access. There is no admin role, admin page, or admin-only capability.
- Sign-in is included in the first local end-to-end slice and is required before the public AWS showcase.
- Each user has one session on one device; signing in elsewhere ends the previous one. The active analysis session and result set are user-scoped and stored server-side in PostgreSQL. They survive page refresh, and are deleted when the session ends (logout, closing the app without signing out, inactivity expiry, or a new sign-in). Logging in again starts fresh; saving and restoring prior analysis sessions is future scope.
- The AI may select and parameterize only an approved capability. It never generates executable SQL or invents metrics.
- Use the public TheLook e-commerce sample dataset only. Do not use employer materials, real customer data, production data, or real credentials.

## Project references

- `docs/product/AI-DATA-CAPABILITIES.md` — the ten data capabilities and interaction contract.
- `docs/security/SECURITY-BASELINE.md` — privacy and security requirements.
- `docs/design/DESIGN-SYSTEM.md` — visual direction and brand references.
- `assets/brand/` — selected logo assets and reference image.
- `docs/AGENTIC-WORKFLOW.md` — idea-to-delivery process and branch-before-spec gate.
