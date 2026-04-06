---
name: rs-epic-worktree
description: Manage epic-level worktree workflows — setup branches, track PR status, sync feature branches, teardown. USE WHEN user says "epic worktree", "setup epic", "sync feature branch", "epic status", "teardown epic".
argument-hint: "[setup|status|sync|teardown] <epic-id>"
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

## Manifest

`epic.json` — source of truth. Stored in epic worktree after setup.

```json
{
  "epic": "PROJ-100",
  "repos": {
    "app": {
      "git_source": "~/repos/app",
      "worktree_root": "~/worktrees/app",
      "feature_branch": "PROJ-100/embed-support",
      "worktree_cmd": "minion-worktree --skip-dev-db --skip-test-db",
      "tickets": {
        "PROJ-201": "if-embedded-chrome",
        "PROJ-202": "redirect-uri"
      }
    }
  }
}
```

| Field            | Required | Description                                                                                             |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------- |
| `git_source`     | yes      | Path to the main git checkout                                                                           |
| `worktree_root`  | yes      | Parent directory for worktrees                                                                          |
| `feature_branch` | yes      | Epic feature branch name                                                                                |
| `worktree_cmd`   | no       | Custom worktree creation command. Receives `--repo <path> --branch <name>`. Default: `git worktree add` |
| `tickets`        | yes      | Map of ticket ID to short description                                                                   |

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

Status values: `created`, `exists`, `failed`.

**status** — Checks PR status via `gh`. Shows `● merged`, `◐ open`, `◑ draft`, `○ no PR` with progress count.

**sync** — Rebuilds feature branch: reset to `origin/main`, merge unmerged ticket branches. Skips repo if all tickets merged. Aborts on conflict.

**teardown** — Removes worktrees and deletes merged branches. Confirms unless `--force`.

## Dependencies

`git`, `gh` (authenticated), `jq`
