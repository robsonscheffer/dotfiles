---
name: rs-scratch-worktree
description: Use when about to run `git worktree add` for a repo that has a persistent scratch worktree configured, or starting a ticket in one of those repos — checks and claims the dependency-installed scratch worktree instead of paying the create+install cost again.
---

# rs-scratch-worktree

One persistent, pre-installed worktree per configured repo (e.g. `~/worktrees/<repo>/scratch`) so starting a ticket doesn't mean re-running the full setup from zero. A sibling JSON file tracks whether it's free. Which repos have one, and their setup commands, is listed in the local project's AGENTS.md/CLAUDE.md — this skill covers the reuse protocol only.

## When to use

- About to run `git worktree add` for a repo that has a scratch worktree configured.
- Starting a ticket in one of those repos.
- Setting up a new scratch worktree for a repo that doesn't have one yet — run
  `scripts/setup-scratch-worktree.sh <git_source_repo> <worktree_root> [default_branch] -- <setup_cmd...>`
  instead of doing it by hand. It creates `<worktree_root>/scratch` on branch `scratch`, writes the
  idle state file, and runs the setup command once. Refuses to run if `<worktree_root>/scratch`
  already exists (use the claim/release protocol on an existing one, don't re-bootstrap it).

## When NOT to use

- A repo with no scratch worktree configured — use the normal ephemeral pattern.
- Two tickets need parallel isolated work in the same repo at once. Only one can hold scratch; the second uses the normal ephemeral pattern (`~/worktrees/<repo>/<branch>/`, removed when done) — see Fallback.

## The state file

Sibling to the worktree, NOT inside it — never git-tracked, no gitignore needed:

```
~/worktrees/<repo>/.scratch-state.json
```

```json
{
  "status": "idle",
  "branch": null,
  "ticket": null,
  "claimed_at": null,
  "last_synced_at": null
}
```

## Protocol

1. **Read the state file.** `idle` → go to step 2. `in-use` → skip to Fallback.
2. **Check `git status --short` in the scratch worktree regardless of what the file says.** Any output means uncommitted work is sitting there — treat it as occupied and do not reset. The state file is a courtesy; the working tree is the truth.
   - **Stale-idle refresh:** if `status: idle` and `last_synced_at` is null or more than 24h old, refresh it before claiming (or even if you're not claiming — it's a courtesy to the next agent): `git fetch origin main && git reset --hard origin/main && ./bin/setup [flags]`, then update `last_synced_at` to now, still `status: idle`. Without this, "always ready" quietly degrades — a scratch worktree left idle for weeks means the next claim's `bin/setup` has as much to catch up on as a brand-new worktree would, defeating the point.
3. **Claim it:**
   ```sh
   cd ~/worktrees/<repo>/scratch
   git fetch origin main
   git reset --hard origin/main
   git switch -c <ticket-branch>
   ```
   Write `{"status":"in-use","branch":"<ticket-branch>","ticket":"<ticket-id>","claimed_at":"<ISO timestamp>","last_synced_at":"<same timestamp>"}` to the sibling state file — claiming syncs it, so `last_synced_at` moves too.
4. **Run the repo's `bin/setup`** (never call the package manager directly — `bin/setup` is the
   setup contract, and usually covers more than dependency install: services, DB, etc.). It's
   normally cached internally, so it's safe and cheap to run on every claim. Use whatever
   non-interactive/agent flag it documents — check `bin/setup --help` if unsure. Do NOT assume
   every repo's `bin/setup` supports the same flag; verify per repo.
5. **Work normally** in `~/worktrees/<repo>/scratch`.
6. **Release when done** (branch merged or abandoned):
   ```sh
   git switch scratch
   ```
   Consider syncing to `origin/main` first (`git fetch && git reset --hard origin/main && ./bin/setup [flags]`) so the slot comes back idle already fresh, not just idle-and-stale. Write the state file back to `{"status":"idle","branch":null,"ticket":null,"claimed_at":null,"last_synced_at":"<now if you synced, else unchanged>"}`. Do this before ending the session — an unreleased claim blocks the next agent from reusing the slot.

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
| Calling the package manager directly (`yarn install`, `bundle install`) instead of `bin/setup`  | `bin/setup` is the contract — it may do more than install deps, and its caching is what makes re-running it on every claim cheap.       |
| Assuming one repo's non-interactive flag works for another                                      | Check `bin/setup --help` per repo — flag names aren't consistent across repos.                                                          |
| Assuming "idle" means "ready"                                                                   | Check `last_synced_at` — an idle worktree nobody's touched in weeks is behind `main`; refresh it rather than letting it silently rot.   |

## Configuring a repo

Add to the repo's AGENTS.md/CLAUDE.md: the scratch path and the exact `bin/setup` invocation (including any non-interactive flag, verified against `--help`). See this project's own AGENTS.md for a live example.
