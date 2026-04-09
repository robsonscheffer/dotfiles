# Workbench

A lightweight, AI-driven engineering workflow system. Tracks tickets, worktrees, PRs, and CI state in a single `active.yaml` registry. One CLI (`wb`) as the plumbing layer, Taskfile for composable workflows, and a Claude Code skill as the orchestrator.

## Installation

### With chezmoi (recommended for dotfiles users)

If you're using the parent dotfiles repo with chezmoi, workbench installs automatically:

```bash
chezmoi apply
```

This runs `run_once_install-workbench.sh` which symlinks `wb` to `~/.local/bin/` and the skill to `~/.claude/skills/workbench`.

### Standalone

Clone the repo and run the install script directly:

```bash
git clone <repo> /path/to/dotfiles
cd /path/to/dotfiles/workbench
./install.sh
```

### Dependencies

Already common on a dev machine:

- `ruby` (3.x, stdlib only — no gems)
- `git`, `gh`, `jq`, `curl`
- [`task`](https://taskfile.dev) — install via `mise use -g task` or `brew install go-task`

## Quick start

```bash
# See what you're tracking
wb list

# Start a new ticket
task start TICKET=PROJ-123 REPO_PATH=~/code/my-app

# Focus on a ticket (syncs state, prints summary)
task focus TICKET=PROJ-123

# Morning briefing (syncs everything, compiles status)
task briefing

# Archive a completed ticket
task archive TICKET=PROJ-123

# Check drift between registry and filesystem
wb reconcile | jq .
```

## Architecture

```
Layer 5: Orchestrator Skill (Claude Code)
  /wb, /work-start, /work-focus, /briefing

Layer 4: Taskfile (composable task runner)
  task start / task focus / task briefing / task sync-all

Layer 3: Scripts (bash, independently runnable)
  sync-github, sync-worktrees, detect-stale, fetch-context

Layer 2: CLI plumbing (wb — Ruby, stdlib only)
  wb add / remove / update / get / list / start / archive

Layer 1: State file (active.yaml)
  Single source of truth at ~/.workbench/active.yaml
```

## CLI reference

```
wb list [--json]                          List all tickets
wb get <id> [--json]                      Print ticket details
wb add <id> <repo> <worktree> [--base B]  Register a ticket
wb remove <id>                            Deregister a ticket
wb update <id> <field> <value>            Update a field
wb touch <id>                             Update last_touched
wb path <id>                              Print worktree path
wb find <path>                            Find ticket by worktree path

wb add-pr <id> <pr_number>                Add PR to ticket
wb remove-pr <id> <pr_number>             Remove PR from ticket
wb update-pr <id> <num> <field> <value>   Update PR field

wb start <id> <repo_path> [--base B]      Create worktree + register
wb archive <id> [--force]                  Archive + deregister
wb focus <id_or_path> [--quiet]            Show context, touch timestamp

wb validate                               Check active.yaml for errors
wb migrate                                Migrate old schema to new
wb reconcile                              Compare registry vs filesystem
```

## Runtime state

State lives at `~/.workbench/` (NOT managed by chezmoi or this repo):

```
~/.workbench/
  active.yaml                    # Ticket registry
  state/                         # Logs
  {owner/repo}/
    knowledge/                   # Persistent repo knowledge
    active/{ticket}/             # In-progress ticket notes
    archive/{ticket}/            # Completed ticket notes
```

## Testing

```bash
# Run the minitest suite (uses isolated temp dirs, safe to run anytime)
cd workbench && ruby test/test_workbench.rb
```
