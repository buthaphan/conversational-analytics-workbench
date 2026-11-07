# Conversational Analytics Workbench

![Conversational Analytics Workbench logo](assets/brand/logo.svg)

**Ask your data. See the evidence.**

A portfolio showcase for exploring business data with natural-language questions. The assistant selects from ten approved data capabilities; the application validates requests and performs calculations; charts and tables present the verified results. Users can ask follow-up questions against the active result set and must confirm before switching to a different data scope.

## Current stage

Idea capture and function review. TASK-001 (user accounts and sign-in) is accepted and paused until TASK-002 (design system) is approved. There is no application code or task specification yet. The proposed base branch is `main`; the user will initialize and manage Git. See `docs/PROJECT-SETUP.md` and the two idea folders under `docs/ideas/` for the current decisions and open items.

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
