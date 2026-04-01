#!/usr/bin/env bash
# worktree-setup — Session start hook for worktree context loading
set -euo pipefail

if ! git rev-parse --is-inside-work-tree &>/dev/null; then
	exit 0
fi

WORKTREE_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || true)
[[ -z "$WORKTREE_ROOT" ]] && exit 0

# Use wb if available — touches last_touched and resolves ticket context
if command -v wb &>/dev/null; then
	wb focus --quiet "$WORKTREE_ROOT" 2>/dev/null || true
fi

echo "OK"
