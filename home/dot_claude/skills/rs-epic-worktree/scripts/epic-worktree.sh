#!/usr/bin/env bash
set -euo pipefail

# epic-worktree.sh — Epic-level worktree orchestration
#
# Usage:
#   epic-worktree.sh setup <epic-id> <manifest-path>
#   epic-worktree.sh status <epic-id>
#   epic-worktree.sh sync <epic-id> [--repo <name>]
#   epic-worktree.sh teardown <epic-id> [--force]

# ── Helpers ──────────────────────────────────────────────────

die() { echo "Error: $*" >&2; exit 1; }

expand_path() {
  [[ "$1" == "~/"* ]] && echo "$HOME/${1#\~/}" || echo "$1"
}

ticket_number() { echo "$1" | grep -oE '[0-9]+$'; }

branch_name() { echo "$1/$(ticket_number "$2")-$3"; }

get_remote() {
  git -C "$(expand_path "$1")" remote get-url origin 2>/dev/null \
    | sed -E 's|.*github\.com[:/]||; s|\.git$||'
}

find_manifest() {
  for f in "$HOME/worktrees"/*/"$1"/epic.json; do
    [[ -f "$f" ]] && echo "$f" && return
  done
  die "No manifest for '$1'. Searched ~/worktrees/*/$1/epic.json"
}

# Find worktree path by branch name (porcelain output)
find_worktree() {
  git -C "$1" worktree list --porcelain 2>/dev/null | awk -v b="refs/heads/$2" '
    /^worktree /{ p=substr($0,11) }
    /^branch /{ if ($2==b) { print p; exit } }
  '
}

# Read repo fields from manifest into GS, WT, FB, WCMD
read_repo() {
  local m="$1" r="$2"
  GS=$(expand_path "$(echo "$m" | jq -r ".repos[\"$r\"].git_source")")
  WT=$(expand_path "$(echo "$m" | jq -r ".repos[\"$r\"].worktree_root")")
  FB=$(echo "$m" | jq -r ".repos[\"$r\"].feature_branch")
  WCMD=$(echo "$m" | jq -r ".repos[\"$r\"].worktree_cmd // empty")
}

# ── setup ────────────────────────────────────────────────────

_create_wt() {
  local gs="$1" wt="$2" id="$3" branch="$4" cmd="$5" out="$6" repo="$7" type="$8"

  # Already exists?
  local existing
  existing=$(find_worktree "$gs" "$branch")
  if [[ -n "$existing" ]]; then
    printf '{"repo":"%s","id":"%s","branch":"%s","path":"%s","type":"%s","status":"exists"}\n' \
      "$repo" "$id" "$branch" "$existing" "$type" > "$out"
    return
  fi

  local ok=true
  if [[ -n "$cmd" ]]; then
    # shellcheck disable=SC2086
    $cmd --repo "$gs" --branch "$branch" >/dev/null 2>&1 || ok=false
  else
    git -C "$gs" worktree add "$wt/$id" -b "$branch" origin/main --quiet 2>/dev/null || \
      git -C "$gs" worktree add "$wt/$id" "$branch" --quiet 2>/dev/null || ok=false
  fi

  # Discover actual path (works with any worktree tool)
  local path
  path=$(find_worktree "$gs" "$branch")
  [[ -z "$path" ]] && ok=false

  local st; $ok && st="created" || st="failed"
  printf '{"repo":"%s","id":"%s","branch":"%s","path":"%s","type":"%s","status":"%s"}\n' \
    "$repo" "$id" "$branch" "${path:-unknown}" "$type" "$st" > "$out"
}

_setup_repo() {
  local epic="$1" manifest="$2" repo="$3" manifest_path="$4" out_dir="$5"
  mkdir -p "$out_dir"
  read_repo "$manifest" "$repo"

  mkdir -p "$WT"
  [[ -z "$WCMD" ]] && git -C "$GS" fetch origin main --quiet

  local idx=0

  # Epic worktree
  _create_wt "$GS" "$WT" "$epic" "$FB" "$WCMD" "$out_dir/$idx.json" "$repo" "epic"
  idx=$((idx + 1))

  # Ticket worktrees (sequential within repo — avoids git lock contention)
  local tickets
  tickets=$(echo "$manifest" | jq -r ".repos[\"$repo\"].tickets | to_entries[] | \"\(.key)\t\(.value)\"")
  while IFS=$'\t' read -r tid desc; do
    [[ -z "$tid" ]] && continue
    _create_wt "$GS" "$WT" "$tid" "$(branch_name "$epic" "$tid" "$desc")" "$WCMD" "$out_dir/$idx.json" "$repo" "ticket"
    idx=$((idx + 1))
  done <<< "$tickets"

  # Copy manifest to epic worktree
  local epic_path
  epic_path=$(find_worktree "$GS" "$FB")
  [[ -n "$epic_path" ]] && cp "$manifest_path" "$epic_path/epic.json"
}

cmd_setup() {
  local epic="${1:?Usage: epic-worktree setup <epic-id> <manifest-path>}"
  local manifest_path="${2:?Usage: epic-worktree setup <epic-id> <manifest-path>}"
  [[ -f "$manifest_path" ]] || die "Not found: $manifest_path"

  local manifest
  manifest=$(cat "$manifest_path")
  local results_dir
  results_dir=$(mktemp -d)
  local pids=()

  # Dispatch each repo in parallel
  local repos
  repos=$(echo "$manifest" | jq -r '.repos | keys[]')
  while IFS= read -r repo; do
    [[ -z "$repo" ]] && continue
    _setup_repo "$epic" "$manifest" "$repo" "$manifest_path" "$results_dir/$repo" &
    pids+=($!)
  done <<< "$repos"

  # Wait for all repos
  local failed=0
  for pid in "${pids[@]}"; do
    wait "$pid" || failed=$((failed + 1))
  done

  # Collect and output JSON array
  printf '['
  local first=true
  for f in "$results_dir"/*/*.json; do
    [[ -f "$f" ]] || continue
    $first || printf ','
    cat "$f"
    first=false
  done
  printf ']\n'

  rm -rf "$results_dir"
  [[ $failed -eq 0 ]] || exit 1
}

# ── status ───────────────────────────────────────────────────

cmd_status() {
  local epic="${1:?Usage: epic-worktree status <epic-id>}"
  local manifest
  manifest=$(cat "$(find_manifest "$epic")")

  local merged=0 total=0
  echo "$epic Epic Status"
  echo "───────────────────────────────────────────────────────────"

  local repos
  repos=$(echo "$manifest" | jq -r '.repos | keys[]')
  while IFS= read -r repo; do
    [[ -z "$repo" ]] && continue
    read_repo "$manifest" "$repo"
    local remote
    remote=$(get_remote "$GS")

    echo "$repo"
    local tickets
    tickets=$(echo "$manifest" | jq -r ".repos[\"$repo\"].tickets | to_entries[] | \"\(.key)\t\(.value)\"")
    while IFS=$'\t' read -r tid desc; do
      [[ -z "$tid" ]] && continue
      total=$((total + 1))
      local branch pr_json
      branch=$(branch_name "$epic" "$tid" "$desc")
      pr_json=$(gh pr list --repo "$remote" --head "$branch" --json number,state,isDraft --jq '.[0] // empty' 2>/dev/null || echo "")

      if [[ -z "$pr_json" ]]; then
        printf "  %-12s %-24s ○ no PR\n" "$tid" "$desc"
      else
        local state num draft
        state=$(echo "$pr_json" | jq -r '.state')
        num=$(echo "$pr_json" | jq -r '.number')
        draft=$(echo "$pr_json" | jq -r '.isDraft')
        if [[ "$state" == "MERGED" ]]; then
          printf "  %-12s %-24s ● merged\n" "$tid" "$desc"
          merged=$((merged + 1))
        elif [[ "$draft" == "true" ]]; then
          printf "  %-12s %-24s ◑ draft      PR #%s\n" "$tid" "$desc" "$num"
        else
          printf "  %-12s %-24s ◐ open       PR #%s\n" "$tid" "$desc" "$num"
        fi
      fi
    done <<< "$tickets"
    echo ""
  done <<< "$repos"

  echo "Progress: $merged/$total merged"
}

# ── sync ─────────────────────────────────────────────────────

cmd_sync() {
  local epic="${1:?Usage: epic-worktree sync <epic-id> [--repo <name>]}"
  shift
  local filter_repo=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --repo) filter_repo="$2"; shift 2 ;;
      *) die "Unknown: $1" ;;
    esac
  done

  local manifest
  manifest=$(cat "$(find_manifest "$epic")")
  local repos
  repos=$(echo "$manifest" | jq -r '.repos | keys[]')

  while IFS= read -r repo; do
    [[ -z "$repo" ]] && continue
    [[ -n "$filter_repo" && "$repo" != "$filter_repo" ]] && continue
    read_repo "$manifest" "$repo"
    local remote epic_dir
    remote=$(get_remote "$GS")
    epic_dir=$(find_worktree "$GS" "$FB")
    [[ -z "$epic_dir" ]] && die "Epic worktree not found for $FB"

    echo "Syncing $FB ($repo)"

    # Pre-scan: any unmerged tickets?
    local tickets has_unmerged=false
    tickets=$(echo "$manifest" | jq -r ".repos[\"$repo\"].tickets | to_entries[] | \"\(.key)\t\(.value)\"")
    while IFS=$'\t' read -r tid desc; do
      [[ -z "$tid" ]] && continue
      local branch st
      branch=$(branch_name "$epic" "$tid" "$desc")
      st=$(gh pr list --repo "$remote" --head "$branch" --json state --jq '.[0].state // empty' 2>/dev/null || echo "")
      [[ "$st" != "MERGED" ]] && has_unmerged=true && break
    done <<< "$tickets"

    if [[ "$has_unmerged" != "true" ]]; then
      echo "  All tickets merged. Feature branch no longer needed."
      echo ""
      continue
    fi

    # Reset feature branch to latest main
    git -C "$epic_dir" fetch origin main --quiet
    git -C "$epic_dir" checkout -B "$FB" origin/main --quiet
    echo "  ✓ Reset to origin/main"

    # Merge unmerged ticket branches
    local count=0
    while IFS=$'\t' read -r tid desc; do
      [[ -z "$tid" ]] && continue
      local branch st
      branch=$(branch_name "$epic" "$tid" "$desc")
      st=$(gh pr list --repo "$remote" --head "$branch" --json state --jq '.[0].state // empty' 2>/dev/null || echo "")

      if [[ "$st" == "MERGED" ]]; then
        echo "  ⊘ Skipped $tid (merged)"
        continue
      fi
      if ! git -C "$epic_dir" rev-parse --verify "$branch" >/dev/null 2>&1; then
        echo "  ⊘ Skipped $tid (no local branch)"
        continue
      fi
      if git -C "$epic_dir" merge "$branch" --no-edit --quiet 2>/dev/null; then
        echo "  ✓ Merged $branch"
        count=$((count + 1))
      else
        git -C "$epic_dir" merge --abort 2>/dev/null || true
        echo "  ✗ CONFLICT: $branch"
        die "Resolve manually in: $epic_dir"
      fi
    done <<< "$tickets"

    echo "  Ready with $count unmerged ticket(s)."
    echo ""
  done <<< "$repos"
}

# ── teardown ─────────────────────────────────────────────────

cmd_teardown() {
  local epic="${1:?Usage: epic-worktree teardown <epic-id> [--force]}"
  shift
  local force=false
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --force) force=true; shift ;;
      *) die "Unknown: $1" ;;
    esac
  done

  local manifest
  manifest=$(cat "$(find_manifest "$epic")")
  local repos
  repos=$(echo "$manifest" | jq -r '.repos | keys[]')

  # Preview
  echo "Will remove worktrees for: $epic"
  while IFS= read -r repo; do
    [[ -z "$repo" ]] && continue
    read_repo "$manifest" "$repo"
    echo "  $repo: $epic (epic) + $(echo "$manifest" | jq ".repos[\"$repo\"].tickets | length") tickets"
  done <<< "$repos"

  if [[ "$force" != "true" ]]; then
    echo -n "Proceed? [y/N] "
    read -r confirm
    [[ "$confirm" =~ ^[yY]$ ]] || { echo "Aborted."; exit 0; }
  fi

  while IFS= read -r repo; do
    [[ -z "$repo" ]] && continue
    read_repo "$manifest" "$repo"
    echo "Removing $repo..."

    # Ticket worktrees
    local tickets
    tickets=$(echo "$manifest" | jq -r ".repos[\"$repo\"].tickets | to_entries[] | \"\(.key)\t\(.value)\"")
    while IFS=$'\t' read -r tid desc; do
      [[ -z "$tid" ]] && continue
      local branch path
      branch=$(branch_name "$epic" "$tid" "$desc")
      path=$(find_worktree "$GS" "$branch")
      [[ -n "$path" ]] && git -C "$GS" worktree remove "$path" --force 2>/dev/null && echo "  ✓ $tid"
      git -C "$GS" branch -d "$branch" 2>/dev/null && echo "  ✓ Deleted $branch (merged)" || true
    done <<< "$tickets"

    # Epic worktree (last)
    local epic_path
    epic_path=$(find_worktree "$GS" "$FB")
    [[ -n "$epic_path" ]] && git -C "$GS" worktree remove "$epic_path" --force 2>/dev/null && echo "  ✓ $epic (epic)"
    git -C "$GS" branch -D "$FB" 2>/dev/null && echo "  ✓ Deleted $FB" || true
    echo ""
  done <<< "$repos"

  echo "Done."
}

# ── Main ─────────────────────────────────────────────────────

[[ $# -ge 1 ]] || {
  cat <<'EOF'
Usage:
  epic-worktree setup <epic-id> <manifest-path>
  epic-worktree status <epic-id>
  epic-worktree sync <epic-id> [--repo <name>]
  epic-worktree teardown <epic-id> [--force]
EOF
  exit 1
}

cmd="$1"; shift
case "$cmd" in
  setup)    cmd_setup "$@" ;;
  status)   cmd_status "$@" ;;
  sync)     cmd_sync "$@" ;;
  teardown) cmd_teardown "$@" ;;
  -h|--help) exec "$0" ;;
  *) die "Unknown command: $cmd" ;;
esac
