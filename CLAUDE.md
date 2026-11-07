# Project working agreement

## Project profile

- Name: Conversational Analytics Workbench
- Purpose: Let users explore business data with plain-language questions, validated analytics, and clear visual evidence.
- Intended users: Showcase users; every signed-in user has the same ordinary-user role. There is no administrator role or admin UI.
- Context: Portfolio project using the public TheLook e-commerce sample dataset.
- Decision source: `docs/PROJECT-SETUP.md`, approved task specifications, and task decision logs.

## Product boundaries

- Read `docs/product/AI-DATA-CAPABILITIES.md` before changing the data and AI interaction model.
- AI selects and parameterizes an approved capability. Application code validates the request; the data layer performs calculations. The model must not generate arbitrary SQL or invent data.
- A user has at most one authentication session (one device/browser) and one active analysis session. Signing in elsewhere ends the previous session. Store the active result set server-side in PostgreSQL, scoped to the user and authentication session. A page refresh keeps the same session. Logout, closing the app without signing out, expiry, or being replaced by a new sign-in all end the session and delete its analysis data. A fresh login starts a new analysis session.
- Before fetching a different data scope, explain the change and ask the user. Do not silently replace the active result set.
- No admin role, admin page, or admin-only application capability. Local development and tests use one seeded account (`user@example.test`); never create it in the AWS showcase. Showcase provisioning remains open; do not invent an in-app admin workflow.
- Use public sample data only. Do not use employer materials or documents, real customer data, production data, credentials, or private personal information.
- Keep exact metrics grounded in validated application results; the model must not invent or independently calculate numbers.

## Working principles

- Read the current task documents and relevant project references before acting. Do not rely on conversation history alone.
- Treat idea records as proposals. Do not create specifications or implement features without the user's decision to proceed.
- Follow the approved stack, product boundaries, design system, and security rules. Ask before a material change to scope, architecture, privacy, security, or delivery.
- Follow TDD during a user-approved implementation task. `/spec-driven` owns the test plan and measurable Definition of Done; `/implementation` writes tests and implements; `/task-review` independently checks criteria and evidence.
- Keep handoffs concise and link to canonical documents rather than duplicating them.

## Human-controlled actions

- The user creates and switches branches, stages and commits changes, pushes, merges, releases, and deploys. Never run Git commands that change repository state.
- Never run AWS CLI, cloud provisioning, billing, IAM, account, or deployment commands. Prepare instructions for the user to run.
- Never read, print, copy, modify, or transmit secrets, credential files, real environment files, tokens, or private keys. Keep real credentials outside the project and use safe placeholders.
- Ask before installing or updating dependencies, using a network, accessing external services or real credentials, incurring cloud/API costs, changing security controls, deleting data, or causing external effects.
- During a user-approved `/implementation` task, run the focused local tests required for TDD and the approved spec without asking before every ordinary test command.

## Workflow

Follow `docs/AGENTIC-WORKFLOW.md`. Store each idea and its function review together under `docs/ideas/YYYY-MM-DD-short-description/`. Record the user's decision in `IDEA.md`. Before specification, the idea record must be committed on the base branch and the user must create the feature branch. Do not write task-specific specifications on the base branch.

The shared Claude skills are in `.claude/skills/`. Their permissions are guardrails, not a substitute for keeping credentials out of the workspace or reviewing permission prompts. Never use bypass permissions.
