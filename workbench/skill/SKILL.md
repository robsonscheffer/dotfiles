# Workbench Orchestrator

Trigger: /wb, /work, /work-start, /work-archive, /work-focus, /work-status, /briefing

## What This Is

Thin dispatcher. Every flow maps to a single `task` command.
Present script output to the user, suggest next actions.
Never orchestrate multi-step tool flows — the scripts handle that.

## Setup

WB_DIR is wherever the workbench directory is installed.
Find it: `readlink -f $(which wb) | sed 's|/bin/wb$||'`

All commands below assume you `cd` to WB_DIR first:

```bash
WB_DIR=$(readlink -f $(which wb) | sed 's|/bin/wb$||')
cd "$WB_DIR"
```

## Commands

| User says                                    | Run                                       | Then                                                                                                 |
| -------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| "What should I work on?" / /briefing         | `task briefing`                           | Present the report. Suggest the highest-priority ticket from "Needs Attention" or "In Progress".     |
| "Start \<ticket\> in \<repo\>" / /work-start | `task start TICKET=<id> REPO_PATH=<path>` | Present output (worktree path, context summary). Tell user to `cd` to the worktree.                  |
| "Focus on \<ticket\>" / /work-focus          | `task focus TICKET=<id>`                  | Present output (PR state, investigation notes, suggested next actions).                              |
| "Archive \<ticket\>" / /work-archive         | `task archive TICKET=<id>`                | Present output. If it fails due to uncommitted changes, show the error and ask about `--force`.      |
| "Sync everything" / /work-status             | `task sync-all` then `wb reconcile`       | Present the drift report. For each item, suggest a concrete action (archive, register, investigate). |
| "What's stale?"                              | `task detect-stale`                       | Present stale tickets. Suggest archive or re-engage for each.                                        |
| "List tickets" / /wb list                    | `wb list`                                 | Show the table.                                                                                      |

## Conventions

- Jira links: `https://$JIRA_BASE_URL/browse/<ID>` (set via JIRA_BASE_URL env var)
- PR links: `https://github.com/<repo>/pull/<number>`
- Always show ticket ID, repo, and status in summaries
- Script stdout is JSON (machine-readable), stderr is human log
- When presenting JSON output, format it for the user — don't dump raw JSON

## Important

- Do NOT chain multiple wb/task commands yourself. Each row above is ONE command.
- The scripts are idempotent — safe to re-run.
- If a command fails, show the error and suggest alternatives. Don't retry automatically.
