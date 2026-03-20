# Agentic Dotfiles — Claude Guidance

## Local Extensions

If ~/.claude/CLAUDE.local.md exists, its contents are appended to this file during Claude's session. Use it for org-specific instructions (repo maps, test paths, MCP routing, lint commands).

## Efficient Exploration

Use the right tool for the job. Do NOT shotgun shell commands hoping one works.

1. **Built-in tools first.** Use `Grep` and `Glob` before `find` or `grep` in Bash. They're faster, don't trigger permission prompts, and search the codebase efficiently.
2. **Language-native commands for language questions** — `bundle info`, `pip show`, `npm ls`, etc.
3. **Shell commands are a last resort** for codebase exploration. If you need them, use ONE targeted command, not a chain of attempts.

Scope investigations narrowly. Define what you're looking for BEFORE running commands. Read 2-3 files max, then form a hypothesis. Don't read dozens of files filling up context.

Never do this:
- Run 5+ variations of `find`/`grep`/`ag`/`rg` looking for the same thing
- Chain `find -exec grep` when `Grep` tool handles recursive search natively
- Explore "just in case" — have a reason for every file you read

## Tool Preferences

- Use the Write tool to create files. Avoid heredocs in the Bash tool.
- Prefer built-in tools (Read, Write, Edit, Grep, Glob) over shell equivalents.
- Use jq for JSON manipulation, yq for YAML.
- Avoid complex shell pipelines when a built-in tool does the same thing.
- When shell IS needed, prefer simple commands. Keep commands straightforward.

## Commits

- Atomic commits — one logical change per commit.
- Use conventional commit format: `type: description` (feat, fix, refactor, docs, test, chore).
- Run tests and lint before committing. Never use `--no-verify`.
- Check the current branch before push. Confirm before force-push.

## Git Context Awareness

- Always check branch name before committing or pushing.
- Never force-push to main/master without explicit confirmation.
- Prefer creating new commits over amending existing ones.

## macOS Portability

- No `mapfile` (bash 4+ only, macOS ships bash 3).
- No GNU `sed -i` — use `sed -i ''` on macOS.
- No `grep -P` — use `grep -E` for extended regex.
- No `readarray` — use `while IFS= read -r` loops.

## Workspace System

Skills prefixed with `work-*` manage a ticket-based workspace lifecycle via `~/.workbench/`. Key paths:
- `~/.workbench/active.yaml` — active ticket registry
- `~/.workbench/{owner/repo}/knowledge/` — per-repo knowledge base (ci.md, codebase.md, tooling.md)
- `~/.workbench/{owner/repo}/active/{ticket}/` — investigation notes per ticket
- `~/.workbench/{owner/repo}/plans/` — implementation plans

`{owner/repo}` is the full GitHub slug (e.g., `robsonscheffer/agentic-dotfiles`). Resolve from git remote: `git remote get-url origin | sed -E 's|.*github\.com[:/]||; s|\.git$||'`

Use `/work-dashboard` for a unified view before deciding what to tackle. Use `/work-focus` to load full context for a ticket.

## Architecture: Three-Layer Runtime

Skills (SKILL.md) → Tasks (tasks.yaml) → Scripts (~/.agentic/bin/)

- **Skills** dispatch named tasks via `agentic dispatch --task <name>` — never call scripts directly
- **Tasks** are defined in `tasks.yaml` (built-in) and `~/.workbench/workers.local.yaml` (user overrides)
- **Scripts** implement the work at `~/.agentic/bin/` — called only by tasks

To list all available tasks: `agentic dispatch --list`
To dry-run a task: `agentic dispatch --task <name> [--ticket ID] --dry-run`

## Orchestration

Use `/orchestrate` to control multiple Claude Code agents across cmux workspaces. The orchestrator follows a one-shot sweep pattern: survey running workspaces, plan actions, dispatch work, and report results.

All orchestration uses task dispatch:
- `agentic dispatch --task survey --foreground` — One-shot survey
- `agentic dispatch --task workspace-status --foreground` — Workspace states
- `agentic dispatch --task workspace-spawn-prompted --ticket <id> --param model=sonnet --param prompt="..." --foreground` — Spawn agent

## Subagent Verification

- After dispatching subagents, verify that expected artifacts exist on disk.
- Don't trust a subagent's claim of success without checking files.

## Knowledge Base

- Check ~/.workbench/{repo}/knowledge/ for repo-specific patterns before starting work.
- Files: ci.md (CI patterns, known flakes), codebase.md (schema, conventions), tooling.md (CLI tricks, env setup).
