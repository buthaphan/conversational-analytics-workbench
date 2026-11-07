# Project setup and decisions

## Identity and purpose

- Project name: Conversational Analytics Workbench
- Repository slug: conversational-analytics-workbench
- Purpose: Natural-language exploration of business data with explainable, validated results and user-selected visualizations.
- Intended users: Showcase users with the same ordinary-user role. No administrator role or admin UI.
- Context: Personal portfolio/showcase project, initially operated locally and later demonstrated manually on AWS.
- Explicit exclusions: employer materials; real customer/production data; model-generated arbitrary SQL; automatic cloud deployment; administrator workflows.

## Product direction

- One-page analytics application with a result/chart area and a question composer. Voice input remains open for a later decision.
- Source data: public TheLook e-commerce sample dataset.
- AI/data boundary: AI maps intent to one of ten documented capabilities, requests clarification when needed, and proposes display choices. Server-side validation and data code determine parameters and execute calculations.
- Different data scope: explain what the active result set covers and ask before retrieving and replacing it.
- Saved/reopenable analysis sessions are future scope.
- Candidate capabilities: `docs/product/AI-DATA-CAPABILITIES.md`.

## Authentication and analysis-session decisions

- Sign-in and sign-out are included in the first local end-to-end slice and are required before the public AWS showcase.
- Every signed-in user is an ordinary user with the same application access. No admin role, admin route, or admin UI.
- An analysis session and its active result set are stored server-side in PostgreSQL, scoped to the user and current authentication session.
- Single device: a user has at most one authentication session. Signing in on another device or browser ends the previous session and deletes its analysis data.
- A page refresh keeps the same authentication and analysis session.
- Closing the app without signing out counts as signing out. Browsers do not reliably report a close, so the server ends a session after a short period with no activity from an open page. The inactivity timeout is 10 minutes; an open page keeps the session alive, so a refresh never ends it.
- When a session ends (logout, app closed, expiry, or replaced by a new sign-in), delete the associated analysis session, questions, and result data. Logging in again starts a new analysis session; old analysis is not restored.
- Account creation is the first task (TASK-001). Local development and tests use one seeded ordinary account, `user@example.test` / `123456`. This known weak credential must never be created in the AWS showcase or any internet-reachable environment; store only its password hash. Showcase provisioning remains open. Do not add admin UI or assume self-signup or invitations.

## Engineering decisions

- Language: TypeScript for web and API.
- Web: React with Vite; Tailwind CSS and shadcn-style components.
- Charts: Apache ECharts using `echarts-for-react`.
- API: Node.js with NestJS.
- Application and analysis-session state: PostgreSQL.
- Analytical source: BigQuery public TheLook e-commerce dataset.
- AI: Claude through Amazon Bedrock is the current direction; model choice, prompt/data boundaries, credentials, and cost controls must be detailed in the relevant spec.
- Local development: Docker Compose with clearly separated web, API, and supporting services. Exact service layout is to be specified before implementation.
- CI: GitHub Actions for formatting/lint, type checking, tests, production builds, and container builds. No AWS credentials or deployment steps in CI.
- Development and showcase: local development; AWS showcase manually started and stopped by the user. Exact AWS services and spend controls remain open.
- Testing: TDD; the specification defines the test plan and measurable Definition of Done. During an approved implementation, ordinary local test runs are authorized; ask before installs, network use, external services, or costs.

## Design

- Direction: polished, professional analytics application with clear hierarchy, readable data, responsive behavior, and accessible controls.
- Brand: selected circular conversation/chart mark and wordmark in `assets/brand/`.
- Logo colors: deep navy `#18324B`, teal `#14A38B`, warm gold `#E5A93D`. These are brand references; complete UI tokens, chart palette, light/dark behavior, and typography remain open.
- Charts must support legible axes, accessible colors, hover details with exact values, and a clear table/evidence view where appropriate.
- The attached PNG in `assets/brand/reference/` is a visual reference crop only; the SVGs are the project logo assets.

## Security and operations

- Build this app's authentication deliberately; do not copy authentication implementation from another project.
- Scope all analysis/session state to the authenticated user. Delete the associated analysis session and result data whenever the authentication session ends.
- Secrets: never put real credentials in prompts, source, fixtures, logs, Docker build context, images, or tracked files. Use ignored local environment files with safe examples only; supply runtime secrets through the chosen local/AWS mechanism.
- External services: BigQuery and Bedrock use must be explicit in specs with data sent, credentials, quotas, failure behavior, and cost controls documented.
- AWS: no assistant-run AWS or deployment commands; user performs all cloud account and resource operations.

## Workflow configuration

- Base branch: `main` (proposed; the user creates the repository and verifies the initial branch).
- Branch-before-spec: Yes.
- Branch naming: `feature/TASK-###-short-name`.
- Git state changes: user creates/switches branch and stages, commits, pushes, merges, releases.
- Required gates: idea/function review; record user's decision; commit idea on base branch; user-created feature branch; approved spec/DoD and plan before implementation; TDD; independent review; user closeout acceptance.
- Skills: `/function-review`, `/spec-driven`, `/implementation`, conditional `/code-simplicity`, `/task-review`, `/opportunity-review`.

## Open decisions

1. Any absolute session lifetime beyond the 10-minute inactivity timeout; showcase account provisioning on AWS; whether accounts themselves expire; password recovery.
2. Maximum active result-set size and behavior when a complete result exceeds that limit. Never silently truncate results; determine the limit after profiling. (Decided: a capability's `limit` controls displayed/ranked rows from the stored result, not how much is retrieved.)
3. BigQuery access path, query limits, data freshness/caching, dataset date anchor, and local development strategy. The public dataset can be queried through the no-charge BigQuery sandbox with feature limits; billing may be needed beyond that. Verify requirements in the data-access task.
4. Bedrock model, prompt design, response schema, which values are sent, privacy boundary, quotas, and cost controls. Document separate Google and AWS runtime credentials.
5. How narrative text is generated while exact figures remain grounded in validated results.
6. Whether voice input is included in a later milestone and where audio/transcripts would be processed. Recommendation: defer until privacy and data flow are explicit.
7. Whether chart changes use both natural-language requests and direct UI controls.
8. Exact Docker service layout and local dependency setup.
9. AWS hosting topology, manual run/stop procedure, and budget guardrails.
10. Final design tokens, chart palette, typography, responsive breakpoints, and light/dark mode.
11. Milestone 1 acceptance criteria and task sequence after TASK-001.

## Decisions recorded 2026-11-08

| Decision | Recorded direction |
|---|---|
| User access | Authentication is in the first local end-to-end slice and before public AWS showcase. |
| Application roles | Ordinary users only; no admin role or admin UI. |
| Analysis-session storage | PostgreSQL, scoped to the user and current authentication session. |
| Refresh behavior | Keep analysis state through page refresh while authentication remains valid. |
| End of authenticated session | Delete associated analysis session, questions, and result data when the session ends; re-login starts fresh. |
| Devices | One authentication session per user; a new sign-in ends the previous one. |
| Closing without sign-out | Treated as sign-out, enforced by a 10-minute server-side inactivity timeout; refresh keeps the same session. |
| Result `limit` | Selects displayed/ranked rows from the stored active result set; it does not limit retrieval. |
| First task | TASK-001: user accounts and sign-in, including the minimal repository, Docker Compose, and CI foundation it needs. Branch `feature/TASK-001-user-accounts`. |
| Local account | Seed `user@example.test` / `123456` for local development and tests only; never in the AWS showcase. |
| Review skill name | Project review stage renamed to `/task-review` (output `05-task-review.md`) to avoid colliding with Claude Code's bundled `/code-review`. |
