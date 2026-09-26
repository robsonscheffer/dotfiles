#!/usr/bin/env bash
# chezmoi run_always: link the shared communication core into every agent that reads a global
# AGENTS.md. Leaves real files alone unless they are empty; never overwrites content.
set -euo pipefail

core="$HOME/.claude/AGENTS.md"
[[ -f "$core" ]] || { echo "link-agents-md: skipping, $core not found"; exit 0; }

for dst in "$HOME/.codex/AGENTS.md" "$HOME/.pi/agent/AGENTS.md"; do
  [[ -d "$(dirname "$dst")" ]] || continue
  if [[ -L "$dst" ]]; then
    :
  elif [[ -s "$dst" ]]; then
    echo "link-agents-md: skipping $dst, it has its own content"
  else
    ln -sfn "$core" "$dst"
    echo "link-agents-md: linked $dst"
  fi
done
