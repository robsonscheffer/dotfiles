# epic-worktree — Design Spec

A skill + bash script that manages epic-level worktree workflows for Tiger Team feature branch strategies.

## Problem

When working on an epic across multiple repos with multiple tickets, you need:

- Worktrees per ticket with consistent branch naming (`<epic>/<ticket>-<desc>`)
- An ephemeral feature branch that combines `main` + unmerged ticket branches (for when tickets depend on unmerged work)
- Visibility into which PRs are merged vs pending across the epic
- A way to rebuild the feature branch after PRs merge

Manual git commands for this are error-prone and slow. This skill automates the setup, status tracking, and sync workflow.

## Concepts

- **Epic worktree** — a worktree for the epic's feature branch. Acts as a merge point for unmerged ticket branches. Rebuilt from scratch on sync.
- **Ticket worktree** — a worktree per Jira ticket. Branched from `main` by default. Each gets its own PR against `main`.
- **Feature branch** — the branch in the epic worktree. Contains `main` + all unmerged ticket branches merged together. Ephemeral — shrinks as PRs merge and eventually disappears.
- **Manifest** — `epic.json` file that defines the epic's repos, tickets, and branch names.

## Manifest

Stored at `~/worktrees/<repo>/<epic>/epic.json`. Created during `setup`, read by all other commands.

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
        "PROJ-202": "redirect-uri",
        "PROJ-203": "modal-overlays",
        "PROJ-204": "graphql-query"
      }
    },
    "frontend": {
      "git_source": "~/repos/frontend",
      "worktree_root": "~/worktrees/frontend",
      "feature_branch": "PROJ-100/frontend-integration",
      "tickets": {
        "PROJ-301": "feature-flag",
        "PROJ-302": "nav-route",
        "PROJ-303": "embed-container",
        "PROJ-304": "landing-card",
        "PROJ-305": "loading-error-states"
      }
    }
  }
}
```

- `git_source` — the actual git repo checkout (used for `git worktree add`)
- `worktree_root` — where worktrees are created (e.g., `~/worktrees/backend/`)

Branch naming convention: `<epic>/<ticket>-<short-desc>` (e.g., `PROJ-100/201-if-embedded-chrome`).

The manifest is the source of truth. All commands derive paths and branch names from it.

## Commands

### `epic-worktree setup <epic>`

Creates all worktrees and branches for an epic.

**Input:** Interactive prompts or a pre-written manifest.

**Flow:**

1. If no `epic.json` exists, prompt for: epic ID, repos (with source paths), feature branch names, tickets + short descriptions
2. Write `epic.json` to `~/worktrees/<first-repo>/<epic>/epic.json`
3. For each repo:
   a. Fetch latest `main`: `git -C <git_source> fetch origin main`
   b. Create epic worktree: `git -C <git_source> worktree add ~/worktrees/<repo>/<epic> -b <feature_branch> origin/main`
   c. Write `epic.json` into the epic worktree
   d. For each ticket: `git -C <git_source> worktree add ~/worktrees/<repo>/<ticket> -b <epic>/<ticket>-<desc> origin/main`
4. Print summary table of created worktrees

**Output:**

```
Created 10 worktrees for PROJ-100

backend (~/worktrees/backend/)
  PROJ-100   PROJ-100/embed-support             (epic)
  PROJ-201   PROJ-100/201-if-embedded-chrome     (ticket)
  PROJ-202   PROJ-100/202-redirect-uri           (ticket)
  PROJ-203   PROJ-100/203-modal-overlays         (ticket)
  PROJ-204   PROJ-100/204-graphql-query          (ticket)

frontend (~/worktrees/frontend/)
  PROJ-100   PROJ-100/frontend-integration       (epic)
  PROJ-301   PROJ-100/301-feature-flag           (ticket)
  PROJ-302   PROJ-100/302-nav-route              (ticket)
  PROJ-303   PROJ-100/303-embed-container        (ticket)
  PROJ-304   PROJ-100/304-landing-card           (ticket)
  PROJ-305   PROJ-100/305-loading-error-states   (ticket)
```

### `epic-worktree status <epic>`

Shows PR status for all ticket branches across the epic.

**Flow:**

1. Read `epic.json`
2. For each repo, for each ticket branch:
   - `gh pr list --repo <remote> --head <branch> --json number,state,url,title,mergedAt`
3. Classify each: `merged` / `open` / `draft` / `no-pr`
4. Print status table

**Output:**

```
PROJ-100 Epic Status
───────────────────────────────────────────────────────────
backend
  PROJ-201  if-embedded-chrome    ● merged
  PROJ-202  redirect-uri          ◐ open      PR #1234
  PROJ-203  modal-overlays        ○ no PR
  PROJ-204  graphql-query         ○ no PR

frontend
  PROJ-301  feature-flag          ● merged
  PROJ-302  nav-route             ◐ open      PR #567
  PROJ-303  embed-container       ○ no PR
  PROJ-304  landing-card          ○ no PR
  PROJ-305  loading-error-states  ○ no PR

Progress: 2/9 merged
```

### `epic-worktree sync <epic> [--repo <repo>]`

Rebuilds epic feature branches from `main` + unmerged ticket branches.

**Flow:**

1. Run `status` to identify merged vs unmerged ticket branches per repo
2. For each repo (or single repo if `--repo` specified):
   a. If all tickets merged → report "feature branch no longer needed", skip
   b. `cd ~/worktrees/<repo>/<epic>`
   c. `git fetch origin main`
   d. `git checkout -B <feature_branch> origin/main` (reset to latest main)
   e. For each unmerged ticket branch:
   - `git merge <ticket_branch> --no-edit`
   - If merge conflict → abort, report which branches conflict, exit
     f. Report what was merged

**Output:**

```
Syncing PROJ-100/embed-support (backend)
  ✓ Reset to origin/main
  ✓ Merged PROJ-100/203-modal-overlays
  ✓ Merged PROJ-100/204-graphql-query
  ⊘ Skipped PROJ-201 (merged to main)
  ⊘ Skipped PROJ-202 (merged to main)

Feature branch ready with 2 unmerged tickets.
```

**Conflict handling:** If a merge conflicts, the script aborts the merge, reports the conflicting branch, and exits. The user resolves manually in the epic worktree.

### `epic-worktree teardown <epic>`

Removes all worktrees for the epic after it ships.

**Flow:**

1. Read `epic.json`
2. Confirm with user (list what will be removed)
3. For each repo, for each worktree:
   - `git -C <git_source> worktree remove ~/worktrees/<repo>/<ticket>`
   - `git -C <git_source> branch -d <branch>` (only if merged)
4. Remove epic worktree last
5. Clean up `epic.json`

## Skill File

`~/.claude/skills/epic-worktree/SKILL.md` — invokes the bash script and presents results. Triggered by "epic worktree", "setup epic", "sync feature branch", "epic status".

The skill delegates to `scripts/epic-worktree.sh` for all git operations.

## Script Location

`~/.claude/skills/epic-worktree/scripts/epic-worktree.sh`

## Scope Boundaries

**In scope:**

- Worktree creation with correct branch naming
- PR status tracking via `gh`
- Feature branch rebuild (sync)
- Teardown

**Out of scope (for now):**

- cmux workspace creation (can be added later, or done manually via `cmux-minions`)
- minions pipeline integration (ticket worktrees are minions-ready, but pipeline stages are invoked separately)
- Automatic PR creation
- Jira ticket creation

## Dependencies

- `git` with worktree support
- `gh` CLI (authenticated, for PR status)
- `jq` (for manifest parsing)
- Existing worktree roots at `~/worktrees/<repo>/`
