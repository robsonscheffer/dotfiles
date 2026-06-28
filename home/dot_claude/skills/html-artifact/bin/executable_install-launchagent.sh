#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVE_MJS="$SCRIPT_DIR/artifact-serve.mjs"
PLIST_TEMPLATE="$SCRIPT_DIR/launchagents/com.robsonscheffer.html-artifact.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/com.robsonscheffer.html-artifact.plist"
LOG_DIR="$HOME/.local/share/html-artifact"
LOG_PATH="$LOG_DIR/server.log"

NODE_PATH="$(command -v node 2>/dev/null || true)"
if [[ -z "$NODE_PATH" ]]; then
  echo "error: node not found in PATH" >&2
  exit 1
fi

mkdir -p "$LOG_DIR"

sed \
  -e "s|__NODE_PATH__|$NODE_PATH|g" \
  -e "s|__SERVE_MJS_PATH__|$SERVE_MJS|g" \
  -e "s|__LOG_PATH__|$LOG_PATH|g" \
  "$PLIST_TEMPLATE" > "$PLIST_DEST"

launchctl unload "$PLIST_DEST" 2>/dev/null || true
launchctl load "$PLIST_DEST"

echo "Installed. Server: http://localhost:52010"
echo "Log: $LOG_PATH"
echo "Uninstall: launchctl unload $PLIST_DEST && rm $PLIST_DEST"
