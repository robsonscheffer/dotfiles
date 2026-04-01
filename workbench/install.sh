#!/usr/bin/env bash
# Standalone installer for workbench.
# If you use chezmoi with the parent dotfiles repo, this runs automatically
# via run_once_install-workbench.sh — you don't need to run it manually.
set -euo pipefail

WB_DIR="$(cd "$(dirname "$0")" && pwd)"

# Symlink wb to PATH
mkdir -p ~/.local/bin
ln -sf "$WB_DIR/bin/wb" ~/.local/bin/wb

# Symlink skill for Claude Code
mkdir -p ~/.claude/skills
ln -sf "$WB_DIR/skill" ~/.claude/skills/workbench

# Initialize runtime state directory
mkdir -p ~/.workbench/state

echo "Installed:"
echo "  wb CLI     -> ~/.local/bin/wb"
echo "  Skill      -> ~/.claude/skills/workbench"
echo "  State dir  -> ~/.workbench/"
echo ""
echo "Run tasks with: cd $WB_DIR && task <name>"
echo "Install cron:   cd $WB_DIR && task install-cron"
