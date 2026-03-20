#!/usr/bin/env bash
# worktree-setup — Session start hook for worktree context loading
set -euo pipefail

# Detect if inside a git worktree
if ! git rev-parse --is-inside-work-tree &>/dev/null 2>&1; then
  exit 0
fi

WORKTREE_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || true)
if [[ -z "$WORKTREE_ROOT" ]]; then
  exit 0
fi

# Try to detect repo name from git remote
REPO_NAME=$(basename "$(git remote get-url origin 2>/dev/null || echo "$WORKTREE_ROOT")" .git 2>/dev/null || basename "$WORKTREE_ROOT")

# Check for knowledge base
KNOWLEDGE_DIR="$HOME/.workbench/$REPO_NAME/knowledge"
if [[ -d "$KNOWLEDGE_DIR" ]]; then
  echo "Knowledge base found: $KNOWLEDGE_DIR"
  for f in "$KNOWLEDGE_DIR"/*.md; do
    if [[ -f "$f" ]]; then
      echo "  - $(basename "$f")"
    fi
  done
fi

# Check active.yaml for matching ticket
ACTIVE_FILE="$HOME/.workbench/active.yaml"
if [[ -f "$ACTIVE_FILE" ]] && command -v yq &>/dev/null; then
  # Find ticket whose worktree matches current directory
  ticket_id=$(yq -r ".tickets[] | select(.worktree == \"$WORKTREE_ROOT\") | .id // empty" "$ACTIVE_FILE" 2>/dev/null || true)
  if [[ -n "$ticket_id" ]]; then
    echo "Active ticket: $ticket_id"
    # Check for investigation notes
    INVESTIGATION="$HOME/.workbench/$REPO_NAME/active/$ticket_id/investigation.md"
    if [[ -f "$INVESTIGATION" ]]; then
      echo "Investigation notes: $INVESTIGATION"
    fi
  fi
fi

echo "OK"
exit 0
