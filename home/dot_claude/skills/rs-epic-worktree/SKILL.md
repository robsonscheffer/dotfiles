---
name: rs-epic-worktree
description: Manage epic-level worktree workflows — setup branches, track PR status, sync feature branches, teardown. USE WHEN user says "epic worktree", "setup epic", "sync feature branch", "epic status", "teardown epic".
argument-hint: "[setup|status|sync|teardown] <epic-id> or <jira-url>"
---

# epic-worktree

Epic-level worktree orchestration. Manages worktrees across multiple repos for an epic with pluggable worktree creation commands.

## Quick Reference

```bash
EW="$HOME/.claude/skills/rs-epic-worktree/scripts/epic-worktree.sh"

$EW setup <epic-id> <manifest.json>   # Create all worktrees (JSON output)
$EW status <epic-id>                   # PR status for all tickets
$EW sync <epic-id> [--repo <name>]     # Rebuild feature branch from main + unmerged
$EW teardown <epic-id> [--force]       # Remove all worktrees
```

## Agent Workflow

When invoked with a Jira URL or epic ID:

### 1. Fetch epic from Jira

- Get the epic issue (summary, status, description)
- Search child issues via JQL: `"Epic Link" = <epic> OR parent = <epic>`
- Use the `fields` parameter to limit response size: `["summary", "status", "issuetype", "assignee", "labels"]`

### 2. Classify tickets by repo

- Use name prefixes (e.g., `[RepoA]`, `[RepoB]`), labels, or component fields
- Group tickets into repos

### 3. Gather config via AskUserQuestion

Use AskUserQuestion (not inline markdown questions) to confirm:

- **Repo mapping** — which tickets belong to which repo, and the `git_source` path for each
- **Worktree command** — `minion-worktree`, plain `git worktree add`, or custom
- **Ticket selection** — which tickets to include (skip Done tickets by default)
- **Feature branch name** — suggest `<epic-id>/<slug>` as default

Do NOT guess repo paths — ask the user. Paths vary per developer.

### 4. Resolve worktree command

If the user picks a command that might be a shell alias (e.g., `minion-worktree`):

```bash
# Resolve the alias to an absolute path
zsh -ic 'type minion-worktree' 2>/dev/null
# → $MINIONS_HOME/stages/01_create_worktree

# Get the env var value
zsh -ic 'echo $MINIONS_HOME' 2>/dev/null
```

Use the resolved absolute path in the manifest, not the alias name. Aliases are not available in non-interactive script execution.

### 5. Write manifest

Write to `~/.workbench/<epic-id>/epic.json`. Use absolute paths (no `~`).

### 6. Run setup

```bash
$EW setup <epic-id> <manifest-path>
```

### 7. Handle result

- On success: present a results table to the user
- On failure: report the error verbatim. See Error Policy below.

### Error Policy

- If `worktree_cmd` fails, **report the error and stop**. Never fall back to plain `git worktree add` without explicit user approval. Never modify the manifest to remove `worktree_cmd` as a "fix."
- If setup partially succeeds (some repos OK, some failed), report both. Do not tear down successful repos automatically.
- Do not retry setup with a different strategy without asking the user first.

## Manifest

`epic.json` — source of truth. Stored in epic worktree after setup.

```json
{
  "epic": "PROJ-100",
  "repos": {
    "app": {
      "git_source": "/absolute/path/to/repos/app",
      "worktree_root": "/absolute/path/to/worktrees/app",
      "feature_branch": "PROJ-100/embed-support",
      "worktree_cmd": "/absolute/path/to/minion-worktree --skip-dev-db --skip-test-db",
      "tickets": {
        "PROJ-201": "if-embedded-chrome",
        "PROJ-202": "redirect-uri"
      }
    }
  }
}
```

| Field            | Required | Description                                                                                                             |
| ---------------- | -------- | ----------------------------------------------------------------------------------------------------------------------- |
| `git_source`     | yes      | Absolute path to the main git checkout                                                                                  |
| `worktree_root`  | yes      | Absolute path to parent directory for worktrees                                                                         |
| `feature_branch` | yes      | Epic feature branch name                                                                                                |
| `worktree_cmd`   | no       | Custom worktree creation command (absolute path). Receives `--repo <path> --branch <name>`. Default: `git worktree add` |
| `tickets`        | yes      | Map of ticket ID to short description                                                                                   |

Branch naming: `<epic>/<ticket-number>-<short-desc>` (e.g., `PROJ-100/201-if-embedded-chrome`).

## Commands

**setup** — Creates worktrees in parallel (one thread per repo, sequential within). Returns JSON array:

```json
[
  {
    "repo": "app",
    "id": "PROJ-201",
    "branch": "...",
    "path": "/...",
    "type": "ticket",
    "status": "created"
  }
]
```

Status values: `created`, `exists`, `failed`. Failed entries include an `"error"` field with stderr output.

**status** — Checks PR status via `gh`. Shows `● merged`, `◐ open`, `◑ draft`, `○ no PR` with progress count.

**sync** — Rebuilds feature branch: reset to `origin/main`, merge unmerged ticket branches. Skips repo if all tickets merged. Aborts on conflict.

**teardown** — Removes worktrees and deletes merged branches. Confirms unless `--force`.

## Dependencies

`git`, `gh` (authenticated), `jq`

### minion-worktree

`minion-worktree` is a shell alias — not available in non-interactive scripts. Always resolve to the absolute path before using in a manifest. The alias typically points to `$MINIONS_HOME/stages/01_create_worktree`. The script requires Ruby gems to be installed in the ai-tools worktree (run from that directory so mise activates the correct Ruby).
