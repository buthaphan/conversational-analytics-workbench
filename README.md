# Conversational Analytics Workbench

![Conversational Analytics Workbench logo](assets/brand/logo.svg)

**Ask your data. See the evidence.**

A portfolio showcase for exploring business data with natural-language questions. The assistant selects from ten approved data capabilities; the application validates requests and performs calculations; charts and tables present the verified results. Users can ask follow-up questions against the active result set and must confirm before switching to a different data scope.

## Current stage

- **TASK-002 (design system):** complete. The design tokens, components, and chart theme are in `web/`.
- **TASK-001 (user accounts and sign-in):** in progress on `feature/TASK-001-user-accounts`. It adds the NestJS API (`api/`), PostgreSQL, sign-in and sign-out with server-side sessions, and Docker Compose.
- **Next:** the first analytics slice (proposed TASK-003).

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
