---
name: rs-epic-worktree
description: Manage epic-level worktree workflows — setup branches, track PR status, sync feature branches, teardown. USE WHEN user says "epic worktree", "setup epic", "sync feature branch", "epic status", "teardown epic".
argument-hint: "[setup|status|sync|teardown] <epic-id>"
---

# epic-worktree

Manage epic-level worktree workflows for Tiger Team feature branch strategies.

## Concepts

- **Epic worktree** — worktree for the epic's feature branch. Ephemeral merge point for unmerged ticket branches. Rebuilt from scratch on sync.
- **Ticket worktree** — worktree per ticket, branched from `main`. Each gets its own PR against `main`.
- **Feature branch** — `main` + all unmerged ticket branches merged together. Shrinks as PRs merge.
- **Manifest** — `epic.json` in the epic worktree. Source of truth for repos, tickets, branch names.

## Quick Reference

```bash
SCRIPT="$HOME/.claude/skills/rs-epic-worktree/scripts/epic-worktree.sh"

# Setup — create all worktrees from a manifest
$SCRIPT setup <epic-id> <manifest-path>

# Status — show PR status for all ticket branches
$SCRIPT status <epic-id>

# Sync — rebuild feature branches from main + unmerged tickets
$SCRIPT sync <epic-id> [--repo <repo-name>]

# Teardown — remove all worktrees (confirms first)
$SCRIPT teardown <epic-id> [--force]
```

## Manifest Format

Stored in the epic worktree directory. Created by `setup`, read by all commands.

```json
{
  "epic": "PROJ-100",
  "repos": {
    "backend": {
      "git_source": "~/repos/backend",
      "worktree_root": "~/worktrees/backend",
      "feature_branch": "PROJ-100/embed-support",
      "tickets": {
        "PROJ-201": "if-embedded-chrome",
        "PROJ-202": "redirect-uri"
      }
    }
  }
}
```

- `git_source` — the main git repo checkout (used for `git worktree add`)
- `worktree_root` — parent directory for worktrees (e.g., `~/worktrees/backend/`)
- Branch naming: `<epic>/<ticket-number>-<short-desc>` (number extracted from ticket ID)

## Commands

### `setup <epic-id> <manifest-path>`

1. Reads manifest from `<manifest-path>`
2. For each repo: fetches `main`, creates epic worktree + ticket worktrees
3. Copies manifest into each epic worktree
4. Prints summary table

### `status <epic-id>`

1. Finds manifest by scanning `~/worktrees/*/epic-id/epic.json`
2. For each ticket branch: checks PR status via `gh pr list`
3. Prints status table with: `● merged`, `◐ open`, `◑ draft`, `○ no PR`
4. Shows progress count

### `sync <epic-id> [--repo <name>]`

1. Runs status check to identify merged vs unmerged tickets
2. Resets feature branch to `origin/main`
3. Merges each unmerged ticket branch
4. On conflict: aborts merge, reports which branch conflicted, exits

### `teardown <epic-id> [--force]`

1. Lists what will be removed
2. Unless `--force`, prompts for confirmation
3. Removes ticket worktrees, then epic worktrees
4. Deletes merged branches (keeps unmerged)

## Workflow

**Typical usage with Claude Code:**

1. Write an `epic.json` manifest (Claude can help draft it based on tickets)
2. `epic-worktree setup PROJ-100 /path/to/epic.json`
3. Work in ticket worktrees, create PRs against `main`
4. `epic-worktree status PROJ-100` to check progress
5. `epic-worktree sync PROJ-100` when you need unmerged code in the feature branch
6. `epic-worktree teardown PROJ-100` when the epic ships

## Dependencies

- `git` (worktree support)
- `gh` CLI (authenticated)
- `jq` (JSON parsing)
