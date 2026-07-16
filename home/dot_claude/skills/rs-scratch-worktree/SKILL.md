---
name: rs-scratch-worktree
description: Use when about to run `git worktree add` for a repo that has a persistent scratch worktree configured, or starting a ticket in one of those repos — checks and claims the dependency-installed scratch worktree instead of paying the create+install cost again.
---

# rs-scratch-worktree

One persistent, pre-installed worktree per configured repo (e.g. `~/worktrees/<repo>/scratch`) so starting a ticket doesn't mean re-running the full dependency install from zero. A sibling JSON file tracks whether it's free. Which repos have one, and their install commands, is listed in the local project's AGENTS.md/CLAUDE.md — this skill covers the reuse protocol only.

## When to use

- About to run `git worktree add` for a repo that has a scratch worktree configured.
- Starting a ticket in one of those repos.

## When NOT to use

- A repo with no scratch worktree configured — use the normal ephemeral pattern.
- Two tickets need parallel isolated work in the same repo at once. Only one can hold scratch; the second uses the normal ephemeral pattern (`~/worktrees/<repo>/<branch>/`, removed when done) — see Fallback.

## The state file

Sibling to the worktree, NOT inside it — never git-tracked, no gitignore needed:

```
~/worktrees/<repo>/.scratch-state.json
```

```json
{ "status": "idle", "branch": null, "ticket": null, "claimed_at": null }
```

## Protocol

1. **Read the state file.** `idle` → go to step 2. `in-use` → skip to Fallback.
2. **Check `git status --short` in the scratch worktree regardless of what the file says.** Any output means uncommitted work is sitting there — treat it as occupied and do not reset. The state file is a courtesy; the working tree is the truth.
3. **Claim it:**
   ```sh
   cd ~/worktrees/<repo>/scratch
   git fetch origin main
   git reset --hard origin/main
   git switch -c <ticket-branch>
   ```
   Write `{"status":"in-use","branch":"<ticket-branch>","ticket":"<ticket-id>","claimed_at":"<ISO timestamp>"}` to the sibling state file.
4. **Reinstall deps only if lockfiles changed** since the last release, e.g.:
   ```sh
   git diff origin/main -- yarn.lock
   git diff origin/main -- Gemfile.lock
   ```
   No diff → skip install, it's already warm.
5. **Work normally** in `~/worktrees/<repo>/scratch`.
6. **Release when done** (branch merged or abandoned):
   ```sh
   git switch scratch
   ```
   Write the state file back to `{"status":"idle","branch":null,"ticket":null,"claimed_at":null}`. Do this before ending the session — an unreleased claim blocks the next agent from reusing the slot.

## Fallback (scratch is in-use)

Don't wait on it. Use the normal ephemeral pattern instead:

```sh
git worktree add ~/worktrees/<repo>/<ticket-branch> -b <ticket-branch> origin/main
```

Full install required (no shared warm state). Remove with `git worktree remove` when done.

## Common mistakes

| Mistake                                                                                         | Fix                                                                                                                                     |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Treating the unexplained state file as untouchable and always creating a fresh worktree instead | That's the point of the file — read it, claim it, use it. Only fall back when it's genuinely `in-use`.                                  |
| Trusting `status: idle` without checking `git status --short`                                   | A crashed session can leave a stale `idle` claim with dirty files still on disk. The working tree is the source of truth, not the JSON. |
| Forgetting to release after merging                                                             | Next agent can't reuse the slot — release before ending the session.                                                                    |
| Running a full dependency install on every claim                                                | Only needed when lockfiles changed since the last release — diff first.                                                                 |

## Configuring a repo

Add to the repo's AGENTS.md/CLAUDE.md: the scratch path, install command, and lockfile(s) to diff. See this project's own AGENTS.md for a live example.
