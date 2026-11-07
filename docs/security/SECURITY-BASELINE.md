# Security baseline

This is a showcase application. Treat security as a product requirement even when data is sample data.

- Use public sample data only. Do not include employer documents, real customer data, private personal information, or production credentials.
- Do not commit real secrets. Keep local environment files ignored; keep `.env.example` limited to placeholder values. Never expose secrets to the browser bundle, logs, tests, generated charts, or Docker image layers.
- Keep the model away from arbitrary SQL execution. The server validates a structured capability identifier and parameters, applies limits, and performs the query.
- Validate all model output as untrusted input. Never execute text or code returned by the model.
- Every user is an ordinary user; do not add admin routes or admin-only access. Scope authentication sessions, analysis sessions, questions, and active result sets to the signed-in user.
- Store analysis state and result data in PostgreSQL on the server, not in browser storage or model chat history. Preserve it across refresh only while authentication remains valid; delete it on logout or auth-session expiry. Re-login begins with an empty analysis session.
- Define transactional logout cleanup and a safe cleanup path for expired authentication sessions. A cleanup failure must not leave data accessible to a later user or unowned session.
- Document what question/context is sent to Bedrock and what dataset values may be included. Minimize and bound context.
- Apply request, row, time, and model-token limits. Do not silently truncate a result set; determine an explicit maximum and overflow behavior in the relevant spec.
- Keep TLS and secure cookie settings in deployment configuration. Avoid storing raw session tokens; define expiry, revocation, and CSRF protections in the authentication spec.
- Do not run AWS, cloud, Git publication, or deployment actions on behalf of the user.

The relevant task spec must turn these principles into testable controls. These notes are not evidence that controls have been implemented.
