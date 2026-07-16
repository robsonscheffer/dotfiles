#!/usr/bin/env bash
# Bootstrap a persistent scratch worktree for rs-scratch-worktree.
#
# Usage:
#   setup-scratch-worktree.sh <git_source_repo> <worktree_root> [default_branch] -- <setup_cmd...>
#
# Example:
#   setup-scratch-worktree.sh ~/code/web ~/worktrees/web main -- ./bin/setup
#   setup-scratch-worktree.sh ~/code/app ~/worktrees/app main -- ./bin/setup --non-interactive
#
# Creates <worktree_root>/scratch as a git worktree on branch "scratch" tracking
# origin/<default_branch>, writes an idle state file at <worktree_root>/.scratch-state.json
# (sibling to the worktree, never inside it), and runs the setup command once.
set -euo pipefail

if [[ $# -lt 2 ]]; then
	echo "Usage: $0 <git_source_repo> <worktree_root> [default_branch] -- <setup_cmd...>" >&2
	exit 1
fi

GIT_SOURCE="$1"
WORKTREE_ROOT="$2"
shift 2

DEFAULT_BRANCH="main"
if [[ $# -gt 0 && "$1" != "--" ]]; then
	DEFAULT_BRANCH="$1"
	shift
fi

if [[ "${1:-}" == "--" ]]; then
	shift
fi
SETUP_CMD=("$@")

SCRATCH_DIR="$WORKTREE_ROOT/scratch"
STATE_FILE="$WORKTREE_ROOT/.scratch-state.json"

if [[ -e "$SCRATCH_DIR" ]]; then
	echo "Already exists: $SCRATCH_DIR — refusing to overwrite. Use the claim/release protocol instead." >&2
	exit 1
fi

mkdir -p "$WORKTREE_ROOT"

git -C "$GIT_SOURCE" fetch origin "$DEFAULT_BRANCH"
git -C "$GIT_SOURCE" worktree add "$SCRATCH_DIR" -b scratch "origin/$DEFAULT_BRANCH"

cat >"$STATE_FILE" <<EOF
{
  "status": "idle",
  "branch": null,
  "ticket": null,
  "claimed_at": null,
  "last_synced_at": null
}
EOF

if [[ ${#SETUP_CMD[@]} -gt 0 ]]; then
	echo "Running setup: ${SETUP_CMD[*]}"
	(cd "$SCRATCH_DIR" && "${SETUP_CMD[@]}")
fi

echo "Scratch worktree ready: $SCRATCH_DIR"
echo "State file: $STATE_FILE"
