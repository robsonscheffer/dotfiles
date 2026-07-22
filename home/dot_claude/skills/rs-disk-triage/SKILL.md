---
name: rs-disk-triage
description: Use when a Mac is low on disk space, "no space left on device" / ENOSPC errors appear, df shows high usage, or when hunting for reclaimable space across git worktrees, caches, and leftover installers.
---

# rs-disk-triage

## Overview

Disk-full triage has a repeatable shape: most "big" directories are either
dead weight (merged worktrees, leftover .dmg installers) or noise that
regenerates in minutes (caches) and isn't worth the risk of deleting blind.
`scan.sh` automates the discovery pass — the mechanical part, especially
checking every worktree's PR merge status via `gh` — and prints a report.
It never deletes anything itself.

## When to use

- `df -h /System/Volumes/Data` (or `/`) shows single-digit GB free or ENOSPC errors.
- You're about to go hunting for "quick wins" to free space on a dev machine.
- Multiple git worktrees have piled up across `~/worktrees/*` or nested
  `.worktrees/` dirs inside daily-driver checkouts.

**Not for:** freeing space on CI runners or servers (this targets a macOS dev
laptop's directory conventions: `~/worktrees`, `~/workspace` and other repo
roots, Homebrew/npm/go caches, `~/Downloads`).

## Why `df -h /` lies on this Mac's APFS layout

APFS splits the container into System/VM/Preboot/Data volumes. The `/` mount
often reports near-zero available space unrelated to real usage. The actual
data volume is `/System/Volumes/Data` — always check that one, not `/`.

## Running it

```bash
bash ~/.claude/skills/rs-disk-triage/scan.sh
```

Scans `~/workspace` by default for daily-driver checkouts and nested
`.worktrees/` dirs. Add more repo-root directories (uncommitted, local to
your machine) by listing one path per line in `~/.config/rs-disk-triage/roots`.

Takes a few minutes on a large home directory (worktree PR lookups call
`gh` once per clean worktree). Read-only — safe to run anytime, including
while genuinely out of disk space.

## Reading the report

| Section                          | Meaning                                                                                             | Action                                                                         |
| -------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Worktrees — SAFE TO REMOVE       | Merged PR + clean tree, or orphaned (`.git` points at a deleted gitdir)                             | Run the printed command after a glance, no further check needed                |
| Worktrees — JUDGMENT CALLS       | Closed-not-merged (abandoned?), no PR found, or a persistent `scratch` worktree whose branch merged | Read the reason, decide, then act                                              |
| Worktrees — ACTIVE / LEAVE ALONE | Dirty tree, or committed today                                                                      | Do not touch                                                                   |
| git gc candidates                | Large `.git` in a daily-driver checkout (not a worktree)                                            | `git gc --aggressive` reclaims real space without deleting anything you'd miss |
| Downloads installers             | `.dmg`/`.pkg` files                                                                                 | Confirm the app is already in `/Applications`, then bulk-remove                |
| Toolchain/app installs           | Android SDK, Xcode, colima, etc.                                                                    | Never auto-delete — ask the human first                                        |
| Caches                           | Regenerate on next `npm`/`go`/`mise` run                                                            | Lowest-value win — only worth it as an emergency pressure valve                |

## Worktree classification logic

```
clean tree?
  no  -> LEAVE ALONE (dirty)
  yes -> orphaned (.git points nowhere)?
           yes -> SAFE (rm -rf)
           no  -> gh pr list --head <branch> --state all -R <org/repo>
                    MERGED + is "scratch" worktree -> JUDGMENT: reset (git checkout main && git pull), don't delete
                    MERGED + not scratch            -> SAFE: git worktree remove
                    CLOSED (not merged)             -> JUDGMENT: abandoned, confirm
                    no PR, last commit is today     -> LEAVE ALONE (active)
                    no PR, older                    -> JUDGMENT: check manually
```

The `<org/repo>` for the `gh` call comes from `git -C <worktree> remote get-url origin`,
not from a hardcoded org — worktrees can span multiple orgs.

## Common mistakes

- Deleting `~/Library/Caches` first and calling it done — it regenerates on
  the very next `node`/`mise`/`go build`, so it's not a real fix for chronic
  low disk, just a stopgap.
- Running `git worktree remove` from the wrong cwd. Use
  `git -C <worktree-path> worktree remove <worktree-path> --force` — git
  resolves the common gitdir from the worktree's own `.git` pointer file, so
  you don't need to `cd` into the main checkout first.
- Treating a worktree named `scratch` like any other — persistent scratch
  worktrees (see the `rs-scratch-worktree` convention) exist specifically to
  avoid paying `bin/setup`/install cost again. Reset them, don't delete them.
- Assuming a worktree with no PR is stale. Check `last_commit` — same-day
  commits mean it's mid-flight, not abandoned.
- Deleting an `Application Support/<App>/Partitions` or similar Electron
  webview-cache dir without checking first — some app data directories
  (e.g. a sandbox VM bundle) are expensive to re-download; the script lists
  these as judgment calls for a reason.
