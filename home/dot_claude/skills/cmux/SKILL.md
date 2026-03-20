---
name: cmux
description: cmux terminal multiplexer - manage workspaces, spawn agents, restore sessions. USE WHEN user says "restore sessions", "cmux workspaces", "spawn workspace", "list workspaces", "cmux status".
---

# cmux

Manage cmux workspaces and Claude Code agents from one terminal.

## Quick Reference

```bash
# List workspaces
cmux list-workspaces

# Create named workspace with Claude + prompt (no focus steal)
CURRENT=$(cmux current-workspace 2>&1 | awk '{print $1}')
NEW_UUID=$(cmux new-workspace --command "claude 'Your prompt here'" 2>&1 | awk '{print $2}')
cmux rename-workspace --workspace "$NEW_UUID" "workspace-name" 2>&1
cmux select-workspace --workspace "$CURRENT" 2>&1

# Resume session in named workspace (no focus steal)
CURRENT=$(cmux current-workspace 2>&1 | awk '{print $1}')
NEW_UUID=$(cmux new-workspace --command "claude --resume <session-id>" 2>&1 | awk '{print $2}')
cmux rename-workspace --workspace "$NEW_UUID" "workspace-name" 2>&1
cmux select-workspace --workspace "$CURRENT" 2>&1

# Rename / Select / Close
cmux rename-workspace --workspace workspace:N "Name"
cmux select-workspace --workspace workspace:N
cmux close-workspace --workspace workspace:N
```

## Key Patterns

- **Send command to any workspace:** `cmux send --workspace workspace:N "text" && cmux send-key --workspace workspace:N Enter`
- **Read any agent's screen:** `cmux read-screen --workspace workspace:N`
- **Spawn named workspace:** use `spawn-workspace.sh` script below

## Surface (Tab) Management

```bash
# List panes and surfaces
cmux list-panes --workspace workspace:N
cmux list-pane-surfaces --workspace workspace:N

# Move / Reorder / Rename / Close
cmux move-surface --surface surface:S --workspace workspace:N
cmux reorder-surface --surface surface:S --index 0
cmux rename-tab --surface surface:S "New Name"
cmux close-surface --surface surface:S --workspace workspace:N

# Split pane
cmux drag-surface-to-split --surface surface:S left|right|up|down
cmux break-pane --workspace workspace:N --pane pane:M
```

## Scripts

### spawn-workspace.sh

Save to `.claude/skills/cmux/scripts/spawn-workspace.sh` and `chmod +x`.

```bash
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
```

### cmux-session-map.py (Hook)

Save to `~/.claude/hooks/cmux-session-map.py` and `chmod +x`. Register as a hook for `SessionStart` and `SessionEnd`.

Maps Claude Code sessions to cmux surfaces so you can track which session is in which workspace.

```python
#!/usr/bin/env python3
"""Map Claude Code sessions to cmux surfaces/workspaces.
Maintains /tmp/cmux-session-map.json with active mappings."""

import json
import os
import sys
import fcntl
from datetime import datetime

MAP_FILE = "/tmp/cmux-session-map.json"

def load_map():
    try:
        with open(MAP_FILE) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}

def save_map(data):
    with open(MAP_FILE, "w") as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        json.dump(data, f, indent=2)
        f.write("\n")
        fcntl.flock(f, fcntl.LOCK_UN)

def handle_start(payload):
    session_id = payload.get("session_id")
    surface_id = os.environ.get("CMUX_SURFACE_ID")
    workspace_id = os.environ.get("CMUX_WORKSPACE_ID")
    if not session_id or not surface_id:
        return
    data = load_map()
    data[surface_id] = {
        "session_id": session_id,
        "workspace_id": workspace_id or "",
        "cwd": payload.get("cwd", ""),
        "started": datetime.now().isoformat(),
    }
    save_map(data)

def handle_end(payload):
    surface_id = os.environ.get("CMUX_SURFACE_ID")
    if not surface_id:
        return
    data = load_map()
    if surface_id in data:
        del data[surface_id]
        save_map(data)

if __name__ == "__main__":
    try:
        payload = json.load(sys.stdin)
        event = payload.get("hook_event_name")
        if event == "SessionStart":
            handle_start(payload)
        elif event == "SessionEnd":
            handle_end(payload)
    except Exception:
        pass
```

## Socket API

Programmatic control via Unix socket at `/tmp/cmux.sock`. Request format: newline-terminated JSON.

| Method | Purpose |
|--------|---------|
| `workspace.list` | List all workspaces |
| `workspace.create` | Create new workspace |
| `workspace.select` | Switch to workspace |
| `surface.send_text` | Send text to terminal |
| `surface.send_key` | Send keypress (enter, tab, escape) |
| `set-status` | Sidebar status pill (icon, color) |
| `set-progress` | Progress bar (0.0-1.0) |
| `notification.create` | Push notification |

CLI flags: `--json`, `--workspace ID`, `--surface ID`, `--id-format refs|uuids|both`

Docs: https://www.cmux.dev/docs/api
