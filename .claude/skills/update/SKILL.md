---
name: update
description: "Morning update routine: merge Renovate PRs, rebase local work, apply chezmoi changes"
argument-hint: "[--push | --dry-run]"
allowed-tools:
  - Bash(gh pr list:*)
  - Bash(gh pr checks:*)
  - Bash(gh pr diff:*)
  - Bash(gh run view:*)
  - Bash(git fetch:*)
  - Bash(git status:*)
  - Bash(git stash:*)
  - Bash(git add:*)
  - Bash(chezmoi diff:*)
  - Bash(test -f:*)
  - Read
  # NOTE: These require user approval for safety:
  # - gh pr merge (modifies remote state)
  # - git rebase (can rewrite history)
  # - git push (publishes to remote)
  # - chezmoi apply (installs tools, modifies files)
  # - Edit (for conflict resolution)
---

# Update: Morning Maintenance

Merge Renovate PRs, rebase local work on updated main, resolve conflicts intelligently, and apply chezmoi changes.

## Arguments

```
$ARGUMENTS
```

Options:
- `--push` - Also push rebased commits to origin
- `--dry-run` - Show what would be done without making changes

## Instructions

### 0. Check AGENTS.local.md Freshness

```bash
test -f AGENTS.local.md && echo "exists" || echo "missing"
```

If missing or older than 7 days: suggest running `/agents-local-md` before continuing.
This is **advisory only** — continue the update regardless.

### 1. Check for Uncommitted Work

```bash
git status --short
```

If tracked files are modified, stash them:
```bash
git stash push -u -m "update skill: stashing before merge"
```

### 2. List and Evaluate Renovate PRs

```bash
gh pr list --author "app/renovate" --json number,title,headRefName,statusCheckRollup
```

For each PR:
- Check CI status with `gh pr checks <number>`
- If all critical checks pass, prepare to merge
- If `--dry-run`, just report what would be merged

### 3. Merge Passing PRs

For each green PR:
```bash
gh pr merge <number> --squash --delete-branch
```

### 4. Fetch and Rebase

```bash
git fetch origin
git rebase origin/main
```

**When conflicts occur:**
1. Read the conflicted file
2. Resolution strategy:
   - **Version conflicts**: take newer version
   - **New additions on both sides**: keep both
   - **Structural conflicts**: favor incoming (Renovate) unless it breaks local additions
3. Edit to resolve, then: `git add <file> && git rebase --continue`

### 5. Pop Stash

If stashed earlier:
```bash
git stash pop
```

### 6. Push (if requested)

If `--push` in arguments:
```bash
git push origin <current-branch>
```

### 7. Preview and Apply Chezmoi

```bash
chezmoi diff
```

Show summary of changes, then apply:
```bash
chezmoi apply
```

### 8. Summary

Present a table:

| Action | Details |
|--------|---------|
| PRs merged | #121 (chezmoi 2.x), #122 (ruby 3.4.x) |
| Conflicts resolved | — |
| Chezmoi applied | ruby 3.4.x installed |
| Status | up to date with origin/main |

## Edge Cases

- **No Renovate PRs**: skip merge step, just rebase/apply
- **All PRs failing**: don't merge any, report to user
- **Chezmoi template warning**: normal after config changes, not an error
