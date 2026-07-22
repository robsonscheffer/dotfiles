#!/usr/bin/env bash
# rs-disk-triage scanner — discovery only, never deletes anything.
# Prints a categorized report: SAFE (with ready-to-run commands),
# JUDGMENT CALLS (confirm first), and ACTIVE/LEAVE ALONE.
set -uo pipefail

BOLD=$'\033[1m'; RESET=$'\033[0m'
section() { printf "\n%s== %s ==%s\n" "$BOLD" "$1" "$RESET"; }
today=$(date +%Y-%m-%d)

# Repo-root directories to scan for daily-driver checkouts and nested
# .worktrees/ dirs. Defaults to ~/workspace; add more via a local,
# uncommitted file at ~/.config/rs-disk-triage/roots (one path per line).
REPO_ROOTS=("$HOME/workspace")
roots_file="$HOME/.config/rs-disk-triage/roots"
if [ -f "$roots_file" ]; then
  while IFS= read -r line; do
    [ -n "$line" ] && REPO_ROOTS+=("$line")
  done < "$roots_file"
fi

section "Real free space (APFS root often lies — Data volume is the truth)"
df -h /System/Volumes/Data 2>/dev/null || df -h /

section "Top-level home directory usage"
du -h -d 1 "$HOME" 2>/dev/null | sort -rh | head -20

# ---- worktree discovery -----------------------------------------------
find_worktrees() {
  for base in "$HOME"/worktrees/*/; do
    [ -d "$base" ] || continue
    for d in "$base"*/; do
      d="${d%/}"
      [ -e "$d/.git" ] && echo "$d"
    done
  done
  find "${REPO_ROOTS[@]}" -maxdepth 4 -type d -name ".worktrees" 2>/dev/null | while read -r wt; do
    find "$wt" -mindepth 1 -maxdepth 2 -type d 2>/dev/null | while read -r d; do
      [ -e "$d/.git" ] && echo "$d"
    done
  done
}

safe=(); judgment=(); leave=()

while IFS= read -r d; do
  [ -z "$d" ] && continue
  size=$(du -sh "$d" 2>/dev/null | cut -f1)

  # Orphaned: .git file points at a gitdir that no longer exists.
  if [ -f "$d/.git" ]; then
    gitdir=$(sed -n 's/^gitdir: //p' "$d/.git" 2>/dev/null)
    if [ -n "$gitdir" ] && [ ! -d "$gitdir" ]; then
      safe+=("ORPHANED   $size  $d
    -> rm -rf '$d'")
      continue
    fi
  fi

  branch=$(git -C "$d" branch --show-current 2>/dev/null)
  dirty=$(git -C "$d" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
  lastdate=$(git -C "$d" log -1 --format=%cd --date=short 2>/dev/null)

  if [ "$dirty" != "0" ]; then
    leave+=("DIRTY      $size  $d  branch=$branch (uncommitted changes, do not touch)")
    continue
  fi

  remote_url=$(git -C "$d" remote get-url origin 2>/dev/null)
  org_repo=$(echo "$remote_url" | sed -E 's#.*[:/]([^/]+/[^/]+)(\.git)?$#\1#; s/\.git$//')

  pr_json="[]"
  if [ -n "$org_repo" ] && [ -n "$branch" ]; then
    pr_json=$(gh pr list --head "$branch" --state all --json number,state,mergedAt -R "$org_repo" 2>/dev/null || echo "[]")
  fi
  state=$(echo "$pr_json" | jq -r '.[0].state // "NONE"' 2>/dev/null)
  prnum=$(echo "$pr_json" | jq -r '.[0].number // ""' 2>/dev/null)

  is_scratch=false
  [ "$(basename "$d")" = "scratch" ] && is_scratch=true

  if [ "$state" = "MERGED" ]; then
    if $is_scratch; then
      judgment+=("SCRATCH-MERGED  $size  $d  branch=$branch PR#$prnum merged
    -> reset, don't delete: (cd '$d' && git checkout main && git pull)")
    else
      safe+=("MERGED     $size  $d  branch=$branch PR#$prnum ($org_repo)
    -> git -C '$d' worktree remove '$d' --force")
    fi
  elif [ "$state" = "CLOSED" ]; then
    judgment+=("ABANDONED  $size  $d  branch=$branch PR#$prnum closed-not-merged — confirm before removing")
  elif [ -n "$lastdate" ] && [ "$lastdate" = "$today" ]; then
    leave+=("ACTIVE     $size  $d  branch=$branch last_commit=$lastdate (today)")
  else
    judgment+=("NO-PR      $size  $d  branch=$branch last_commit=$lastdate — no PR found, check manually")
  fi
done < <(find_worktrees)

section "Worktrees — SAFE TO REMOVE (merged or orphaned, clean tree)"
if [ ${#safe[@]} -eq 0 ]; then echo "(none found)"; else printf '%s\n\n' "${safe[@]}"; fi

section "Worktrees — JUDGMENT CALLS (confirm before acting)"
if [ ${#judgment[@]} -eq 0 ]; then echo "(none found)"; else printf '%s\n\n' "${judgment[@]}"; fi

section "Worktrees — ACTIVE / LEAVE ALONE"
if [ ${#leave[@]} -eq 0 ]; then echo "(none found)"; else printf '%s\n\n' "${leave[@]}"; fi

# ---- git gc candidates -------------------------------------------------
section "Large .git dirs — git gc candidates (reclaims space, deletes nothing)"
for root in "${REPO_ROOTS[@]}"; do
for repo_git in "$root"/*/.git; do
  [ -d "$repo_git" ] || continue
  size=$(du -sh "$repo_git" 2>/dev/null | cut -f1)
  repo=$(dirname "$repo_git")
  echo "$size  $repo_git"
  echo "    -> (cd '$repo' && git gc --aggressive)"
done
done

# ---- Downloads installers ----------------------------------------------
section "Downloads — installer files (check each is already in /Applications)"
if [ -d "$HOME/Downloads" ]; then
  found=0
  while IFS= read -r f; do
    found=1
    size=$(du -h "$f" 2>/dev/null | cut -f1)
    echo "$size  $f"
  done < <(find "$HOME/Downloads" -maxdepth 1 -type f \( -iname "*.dmg" -o -iname "*.pkg" \) 2>/dev/null)
  [ "$found" = "0" ] && echo "(none found)"
  echo "-> after checking the app is installed: rm -f ~/Downloads/*.dmg ~/Downloads/*.pkg"
fi

# ---- judgment-call toolchains -------------------------------------------
section "Toolchain/app installs — judgment calls, never auto-delete"
for p in "$HOME/.android/avd" "$HOME/Library/Android" "$HOME/.colima" \
         "$HOME/Library/Application Support/Claude/vm_bundles" \
         "/Applications/Xcode.app" "/Applications/Android Studio.app" "/Applications/iMovie.app"; do
  [ -e "$p" ] || continue
  size=$(du -sh "$p" 2>/dev/null | cut -f1)
  echo "$size  $p"
done

# ---- caches (low value, regenerate fast) --------------------------------
section "Caches — regenerate on next use, low-value quick win"
for p in "$HOME/Library/Caches" "$HOME/.cache" "$HOME/.npm" \
         "$HOME/Library/Caches/go-build" "$HOME/Library/Caches/Homebrew" \
         "$HOME/.yarn/berry" "$HOME/go/pkg" "$HOME/.rustup/toolchains"; do
  [ -e "$p" ] || continue
  size=$(du -sh "$p" 2>/dev/null | cut -f1)
  echo "$size  $p"
done
