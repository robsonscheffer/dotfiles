#!/bin/bash
# Spawn a named cmux workspace with Claude Code (no focus steal)
# Usage: spawn-workspace.sh <name> [--prompt "..."] [--loop [pct]]
#
# --loop       Enable infinite loop (auto-handoff at 60% context)
# --loop 70    Enable infinite loop at 70% context

set -e

NAME="${1:?Usage: spawn-workspace.sh <name> [--prompt \"...\"] [--loop [pct]]}"
shift

PROMPT=""
LOOP_PCT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --prompt) PROMPT="$2"; shift 2 ;;
    --loop)
      if [[ -n "$2" ]] && [[ "$2" =~ ^[0-9]+$ ]]; then
        LOOP_PCT="$2"; shift 2
      else
        LOOP_PCT="60"; shift
      fi
      ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

CURRENT=$(cmux current-workspace 2>&1 | awk '{print $1}')

if [[ -n "$PROMPT" ]]; then
  TMPFILE=$(mktemp /tmp/spawn-prompt.XXXXXX)
  echo "$PROMPT" > "$TMPFILE"
  NEW_UUID=$(cmux new-workspace --command "claude \"\$(cat $TMPFILE)\"" 2>&1 | awk '{print $2}')
else
  NEW_UUID=$(cmux new-workspace --command "claude" 2>&1 | awk '{print $2}')
fi

cmux rename-workspace --workspace "$NEW_UUID" "$NAME" 2>&1

# Register loop config for this workspace
if [[ -n "$LOOP_PCT" ]]; then
  LOOPS_DIR="$HOME/.claude/loops"
  mkdir -p "$LOOPS_DIR"
  echo "{\"threshold\": $LOOP_PCT}" > "$LOOPS_DIR/ws-${NEW_UUID}.json"
  echo "Loop registered at ${LOOP_PCT}% for workspace $NAME"
fi

cmux select-workspace --workspace "$CURRENT" 2>&1
echo "Workspace '$NAME' ready"
