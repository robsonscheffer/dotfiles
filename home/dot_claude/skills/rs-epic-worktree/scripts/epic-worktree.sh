#!/usr/bin/env bash
set -euo pipefail

# epic-worktree.sh — Manage epic-level worktree workflows
#
# Usage:
#   epic-worktree.sh setup <epic-id> <manifest-path>
#   epic-worktree.sh status <epic-id>
#   epic-worktree.sh sync <epic-id> [--repo <name>]
#   epic-worktree.sh teardown <epic-id> [--force]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── Helpers ──────────────────────────────────────────────────

usage() {
  cat <<'EOF'
Usage:
  epic-worktree setup <epic-id> <manifest-path>
  epic-worktree status <epic-id>
  epic-worktree sync <epic-id> [--repo <name>]
  epic-worktree teardown <epic-id> [--force]
EOF
  exit 1
}

die() { echo "Error: $*" >&2; exit 1; }

# Expand ~ in paths (bash 3 compatible)
expand_path() {
  local p="$1"
  if [[ "$p" == "~/"* ]]; then
    echo "$HOME/${p#\~/}"
  else
    echo "$p"
  fi
}

# Find epic.json by scanning worktree roots
# Returns the path to the first epic.json found for this epic
find_manifest() {
  local epic="$1"
  local manifest=""

  # Scan ~/worktrees/*/epic-id/epic.json
  for candidate in "$HOME/worktrees"/*/"$epic"/epic.json; do
    if [[ -f "$candidate" ]]; then
      manifest="$candidate"
      break
    fi
  done

  if [[ -z "$manifest" ]]; then
    die "No manifest found for epic '$epic'. Searched ~/worktrees/*/$epic/epic.json"
  fi
  echo "$manifest"
}

# Extract ticket number suffix from ticket ID (e.g., PROJ-201 → 201)
ticket_number() {
  echo "$1" | grep -oE '[0-9]+$'
}

# Get the remote URL for a git source (org/repo format for gh)
get_remote() {
  local git_source
  git_source="$(expand_path "$1")"
  git -C "$git_source" remote get-url origin 2>/dev/null \
    | sed -E 's|.*github\.com[:/]||; s|\.git$||'
}

# ── setup ────────────────────────────────────────────────────

cmd_setup() {
  local epic="${1:?Usage: epic-worktree setup <epic-id> <manifest-path>}"
  local manifest_path="${2:?Usage: epic-worktree setup <epic-id> <manifest-path>}"

  [[ -f "$manifest_path" ]] || die "Manifest not found: $manifest_path"

  local manifest
  manifest="$(cat "$manifest_path")"

  # Validate manifest structure
  echo "$manifest" | jq -e '.epic' >/dev/null 2>&1 || die "Invalid manifest: missing 'epic' field"
  echo "$manifest" | jq -e '.repos' >/dev/null 2>&1 || die "Invalid manifest: missing 'repos' field"

  local total=0
  local repos
  repos="$(echo "$manifest" | jq -r '.repos | keys[]')"

  # First pass: create all worktrees
  while IFS= read -r repo_name; do
    [[ -z "$repo_name" ]] && continue

    local git_source worktree_root feature_branch
    git_source="$(expand_path "$(echo "$manifest" | jq -r ".repos[\"$repo_name\"].git_source")")"
    worktree_root="$(expand_path "$(echo "$manifest" | jq -r ".repos[\"$repo_name\"].worktree_root")")"
    feature_branch="$(echo "$manifest" | jq -r ".repos[\"$repo_name\"].feature_branch")"

    [[ -d "$git_source/.git" ]] || [[ -d "$git_source" && -f "$git_source/HEAD" ]] || die "Git source not found: $git_source"
    mkdir -p "$worktree_root"

    echo ""
    echo "Setting up $repo_name ($worktree_root)"
    echo "  Fetching origin/main..."
    git -C "$git_source" fetch origin main --quiet

    # Create epic worktree
    local epic_dir="$worktree_root/$epic"
    if [[ -d "$epic_dir" ]]; then
      echo "  Epic worktree already exists: $epic_dir"
    else
      echo "  Creating epic worktree: $feature_branch"
      git -C "$git_source" worktree add "$epic_dir" -b "$feature_branch" origin/main --quiet 2>/dev/null || \
        git -C "$git_source" worktree add "$epic_dir" "$feature_branch" --quiet
      total=$((total + 1))
    fi

    # Copy manifest into epic worktree
    cp "$manifest_path" "$epic_dir/epic.json"

    # Create ticket worktrees
    local tickets
    tickets="$(echo "$manifest" | jq -r ".repos[\"$repo_name\"].tickets | to_entries[] | \"\(.key)\t\(.value)\"")"

    while IFS=$'\t' read -r ticket_id desc; do
      [[ -z "$ticket_id" ]] && continue
      local num
      num="$(ticket_number "$ticket_id")"
      local branch="${epic}/${num}-${desc}"
      local ticket_dir="$worktree_root/$ticket_id"

      if [[ -d "$ticket_dir" ]]; then
        echo "  Ticket worktree already exists: $ticket_dir"
      else
        echo "  Creating ticket worktree: $branch"
        git -C "$git_source" worktree add "$ticket_dir" -b "$branch" origin/main --quiet 2>/dev/null || \
          git -C "$git_source" worktree add "$ticket_dir" "$branch" --quiet
        total=$((total + 1))
      fi
    done <<< "$tickets"

  done <<< "$repos"

  echo ""
  echo "Created $total worktrees for $epic"
  echo ""

  # Print summary table
  while IFS= read -r repo_name; do
    [[ -z "$repo_name" ]] && continue
    local worktree_root feature_branch
    worktree_root="$(expand_path "$(echo "$manifest" | jq -r ".repos[\"$repo_name\"].worktree_root")")"
    feature_branch="$(echo "$manifest" | jq -r ".repos[\"$repo_name\"].feature_branch")"

    printf "%s (%s)\n" "$repo_name" "$worktree_root"
    printf "  %-12s %-40s (epic)\n" "$epic" "$feature_branch"

    local tickets
    tickets="$(echo "$manifest" | jq -r ".repos[\"$repo_name\"].tickets | to_entries[] | \"\(.key)\t\(.value)\"")"
    while IFS=$'\t' read -r ticket_id desc; do
      [[ -z "$ticket_id" ]] && continue
      local num
      num="$(ticket_number "$ticket_id")"
      printf "  %-12s %-40s (ticket)\n" "$ticket_id" "${epic}/${num}-${desc}"
    done <<< "$tickets"
    echo ""
  done <<< "$repos"
}

# ── status ───────────────────────────────────────────────────

cmd_status() {
  local epic="${1:?Usage: epic-worktree status <epic-id>}"

  local manifest_path
  manifest_path="$(find_manifest "$epic")"
  local manifest
  manifest="$(cat "$manifest_path")"

  local merged=0
  local total=0

  echo "$epic Epic Status"
  echo "───────────────────────────────────────────────────────────"

  local repos
  repos="$(echo "$manifest" | jq -r '.repos | keys[]')"

  while IFS= read -r repo_name; do
    [[ -z "$repo_name" ]] && continue

    local git_source
    git_source="$(expand_path "$(echo "$manifest" | jq -r ".repos[\"$repo_name\"].git_source")")"
    local remote
    remote="$(get_remote "$git_source")"

    echo "$repo_name"

    local tickets
    tickets="$(echo "$manifest" | jq -r ".repos[\"$repo_name\"].tickets | to_entries[] | \"\(.key)\t\(.value)\"")"

    while IFS=$'\t' read -r ticket_id desc; do
      [[ -z "$ticket_id" ]] && continue
      total=$((total + 1))

      local num
      num="$(ticket_number "$ticket_id")"
      local branch="${epic}/${num}-${desc}"

      # Check PR status via gh
      local pr_json
      pr_json="$(gh pr list --repo "$remote" --head "$branch" --json number,state,url,isDraft --jq '.[0] // empty' 2>/dev/null || echo "")"

      if [[ -z "$pr_json" ]]; then
        printf "  %-12s %-24s ○ no PR\n" "$ticket_id" "$desc"
      else
        local state pr_number is_draft
        state="$(echo "$pr_json" | jq -r '.state')"
        pr_number="$(echo "$pr_json" | jq -r '.number')"
        is_draft="$(echo "$pr_json" | jq -r '.isDraft')"

        if [[ "$state" == "MERGED" ]]; then
          printf "  %-12s %-24s ● merged\n" "$ticket_id" "$desc"
          merged=$((merged + 1))
        elif [[ "$is_draft" == "true" ]]; then
          printf "  %-12s %-24s ◑ draft      PR #%s\n" "$ticket_id" "$desc" "$pr_number"
        else
          printf "  %-12s %-24s ◐ open       PR #%s\n" "$ticket_id" "$desc" "$pr_number"
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
      *) die "Unknown arg: $1" ;;
    esac
  done

  local manifest_path
  manifest_path="$(find_manifest "$epic")"
  local manifest
  manifest="$(cat "$manifest_path")"

  local repos
  repos="$(echo "$manifest" | jq -r '.repos | keys[]')"

  while IFS= read -r repo_name; do
    [[ -z "$repo_name" ]] && continue

    # Skip if filtering to a specific repo
    if [[ -n "$filter_repo" ]] && [[ "$repo_name" != "$filter_repo" ]]; then
      continue
    fi

    local git_source worktree_root feature_branch
    git_source="$(expand_path "$(echo "$manifest" | jq -r ".repos[\"$repo_name\"].git_source")")"
    worktree_root="$(expand_path "$(echo "$manifest" | jq -r ".repos[\"$repo_name\"].worktree_root")")"
    feature_branch="$(echo "$manifest" | jq -r ".repos[\"$repo_name\"].feature_branch")"

    local remote
    remote="$(get_remote "$git_source")"
    local epic_dir="$worktree_root/$epic"

    [[ -d "$epic_dir" ]] || die "Epic worktree not found: $epic_dir"

    echo "Syncing $feature_branch ($repo_name)"

    local tickets
    tickets="$(echo "$manifest" | jq -r ".repos[\"$repo_name\"].tickets | to_entries[] | \"\(.key)\t\(.value)\"")"

    # Pre-scan: check which tickets need merging
    local has_unmerged=false
    while IFS=$'\t' read -r ticket_id desc; do
      [[ -z "$ticket_id" ]] && continue
      local num
      num="$(ticket_number "$ticket_id")"
      local branch="${epic}/${num}-${desc}"
      local pr_state
      pr_state="$(gh pr list --repo "$remote" --head "$branch" --json state --jq '.[0].state // empty' 2>/dev/null || echo "")"
      if [[ "$pr_state" != "MERGED" ]]; then
        has_unmerged=true
        break
      fi
    done <<< "$tickets"

    if [[ "$has_unmerged" != "true" ]]; then
      echo "  All tickets merged to main. Feature branch no longer needed."
      echo ""
      continue
    fi

    # Fetch latest main and reset feature branch
    git -C "$epic_dir" fetch origin main --quiet
    git -C "$epic_dir" checkout -B "$feature_branch" origin/main --quiet
    echo "  ✓ Reset to origin/main"

    local unmerged=0

    while IFS=$'\t' read -r ticket_id desc; do
      [[ -z "$ticket_id" ]] && continue

      local num
      num="$(ticket_number "$ticket_id")"
      local branch="${epic}/${num}-${desc}"

      # Check if PR is merged
      local pr_state
      pr_state="$(gh pr list --repo "$remote" --head "$branch" --json state --jq '.[0].state // empty' 2>/dev/null || echo "")"

      if [[ "$pr_state" == "MERGED" ]]; then
        echo "  ⊘ Skipped $ticket_id (merged to main)"
        continue
      fi

      # Check if branch exists locally
      if ! git -C "$epic_dir" rev-parse --verify "$branch" >/dev/null 2>&1; then
        echo "  ⊘ Skipped $ticket_id (branch not found)"
        continue
      fi

      # Merge the ticket branch
      if git -C "$epic_dir" merge "$branch" --no-edit --quiet 2>/dev/null; then
        echo "  ✓ Merged ${epic}/${num}-${desc}"
        unmerged=$((unmerged + 1))
      else
        git -C "$epic_dir" merge --abort 2>/dev/null || true
        echo "  ✗ CONFLICT merging ${epic}/${num}-${desc}"
        echo ""
        echo "Merge conflict detected. Resolve manually in: $epic_dir"
        exit 1
      fi
    done <<< "$tickets"

    echo ""
    echo "Feature branch ready with $unmerged unmerged ticket(s)."
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
      *) die "Unknown arg: $1" ;;
    esac
  done

  local manifest_path
  manifest_path="$(find_manifest "$epic")"
  local manifest
  manifest="$(cat "$manifest_path")"

  local repos
  repos="$(echo "$manifest" | jq -r '.repos | keys[]')"

  # List what will be removed
  echo "Will remove worktrees for epic: $epic"
  echo ""

  while IFS= read -r repo_name; do
    [[ -z "$repo_name" ]] && continue
    local worktree_root
    worktree_root="$(expand_path "$(echo "$manifest" | jq -r ".repos[\"$repo_name\"].worktree_root")")"

    echo "$repo_name ($worktree_root)"
    echo "  $epic (epic worktree)"

    local tickets
    tickets="$(echo "$manifest" | jq -r ".repos[\"$repo_name\"].tickets | keys[]")"
    while IFS= read -r ticket_id; do
      [[ -z "$ticket_id" ]] && continue
      echo "  $ticket_id (ticket worktree)"
    done <<< "$tickets"
    echo ""
  done <<< "$repos"

  # Confirm unless --force
  if [[ "$force" != "true" ]]; then
    echo -n "Proceed? [y/N] "
    read -r confirm
    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
      echo "Aborted."
      exit 0
    fi
  fi

  # Remove worktrees
  while IFS= read -r repo_name; do
    [[ -z "$repo_name" ]] && continue

    local git_source worktree_root feature_branch
    git_source="$(expand_path "$(echo "$manifest" | jq -r ".repos[\"$repo_name\"].git_source")")"
    worktree_root="$(expand_path "$(echo "$manifest" | jq -r ".repos[\"$repo_name\"].worktree_root")")"
    feature_branch="$(echo "$manifest" | jq -r ".repos[\"$repo_name\"].feature_branch")"

    echo "Removing $repo_name worktrees..."

    # Remove ticket worktrees first
    local tickets
    tickets="$(echo "$manifest" | jq -r ".repos[\"$repo_name\"].tickets | to_entries[] | \"\(.key)\t\(.value)\"")"

    while IFS=$'\t' read -r ticket_id desc; do
      [[ -z "$ticket_id" ]] && continue
      local num
      num="$(ticket_number "$ticket_id")"
      local branch="${epic}/${num}-${desc}"
      local ticket_dir="$worktree_root/$ticket_id"

      if [[ -d "$ticket_dir" ]]; then
        git -C "$git_source" worktree remove "$ticket_dir" --force 2>/dev/null || \
          echo "  Warning: could not remove worktree $ticket_dir"
        echo "  Removed worktree: $ticket_id"
      fi

      # Delete branch only if merged
      if git -C "$git_source" branch -d "$branch" 2>/dev/null; then
        echo "  Deleted branch: $branch (merged)"
      else
        # Branch not merged or doesn't exist — leave it
        git -C "$git_source" rev-parse --verify "$branch" >/dev/null 2>&1 && \
          echo "  Kept branch: $branch (not merged)"
      fi
    done <<< "$tickets"

    # Remove epic worktree last
    local epic_dir="$worktree_root/$epic"
    if [[ -d "$epic_dir" ]]; then
      git -C "$git_source" worktree remove "$epic_dir" --force 2>/dev/null || \
        echo "  Warning: could not remove epic worktree $epic_dir"
      echo "  Removed epic worktree: $epic"
    fi

    # Delete feature branch (always safe to delete — it's ephemeral)
    git -C "$git_source" branch -D "$feature_branch" 2>/dev/null && \
      echo "  Deleted feature branch: $feature_branch"

    echo ""
  done <<< "$repos"

  echo "Teardown complete for $epic."
}

# ── Main ─────────────────────────────────────────────────────

if [[ $# -lt 1 ]]; then
  usage
fi

COMMAND="$1"; shift

case "$COMMAND" in
  setup)    cmd_setup "$@" ;;
  status)   cmd_status "$@" ;;
  sync)     cmd_sync "$@" ;;
  teardown) cmd_teardown "$@" ;;
  --help|-h) usage ;;
  *) die "Unknown command: $COMMAND" ;;
esac
