# Conversational Analytics Workbench

![Conversational Analytics Workbench logo](assets/brand/logo.svg)

**Ask your data. See the evidence.**

A portfolio showcase for exploring business data with natural-language questions. The assistant selects from ten approved data capabilities; the application validates requests and performs calculations; charts and tables present the verified results. Users can ask follow-up questions against the active result set and must confirm before switching to a different data scope.

## Current stage

- **TASK-002 (design system):** complete. The design tokens, components, and chart theme are in `web/`.
- **TASK-001 (user accounts and sign-in):** complete. The NestJS API (`api/`), PostgreSQL, sign-in and sign-out with server-side sessions, and Docker Compose.
- **TASK-003 (conversational workflow):** complete. The analysis workspace, the backend rules that decide what each question may do, and a development demo model, all without cloud credentials ([architecture proposal](docs/ideas/2026-11-08-conversational-analytics/ARCHITECTURE-PROPOSAL.md)).
- **Next:** TASK-004 connects BigQuery and Claude ([handover](docs/work/completed/TASK-003-conversational-workflow/TASK-004-HANDOVER.md)).

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
- **Data:** until TASK-004, results come from a deterministic synthetic fixture shaped like TheLook (about 400 customers and 120 products, 2024 to 2026).

**Demo mode.** TASK-003 has no AI model. With `ANALYSIS_MODEL=demo` (the default outside production), a development demo model recognises a fixed list of example questions and returns the decision a real model should return. The workspace shows a "Demo mode" banner and the examples as buttons; any other text gets the list of examples. The API refuses to start with the demo model when `NODE_ENV=production`.

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
