#!/usr/bin/env bash
# enforce-pr-template — Warn if gh pr create lacks a body
# Checks the Bash tool input for PR creation without a body/template.
# Always exits 0 (advisory only).
set -euo pipefail

TOOL_INPUT="${1:-}"

# Only check gh pr create commands
if [[ "$TOOL_INPUT" != *"gh pr create"* ]]; then
  exit 0
fi

if [[ "$TOOL_INPUT" != *"--body"* && "$TOOL_INPUT" != *"--template"* ]]; then
  echo "WARN: gh pr create without --body or --template. Consider using a PR template."
fi

exit 0
