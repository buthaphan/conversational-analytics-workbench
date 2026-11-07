# Claude Code project configuration

Claude Code discovers project-level skills from `.claude/skills/<skill-name>/SKILL.md` and project settings from `.claude/settings.json`.

The six project skills define this repository's workflow. The project's independent review stage is `/task-review`, which checks a task against its acceptance criteria and handoff documents. It is deliberately named so it does not collide with Claude Code's bundled `/code-review`; use `/task-review` for this workflow. Use `/skills` in Claude Code, opened from the project root, to confirm the project skills are available.

The shared settings keep permissions in normal mode, disable Auto and bypass modes, block common Git state-changing and AWS/cloud operations through Bash and PowerShell, and prevent common local secret-file reads. They also ask before dependency-install commands. These settings are guardrails for Claude Code tools, not an operating-system security boundary. Keep credentials outside the project, never use bypass permissions, and inspect every permission prompt.
