#!/usr/bin/env bash
# post-edit-lint — Advisory lint after Edit/Write operations
# Runs the appropriate linter based on file extension.
# Always exits 0 (advisory only — never blocks the agent).
set -euo pipefail

FILE_PATH="${1:-}"

if [[ -z "$FILE_PATH" || ! -f "$FILE_PATH" ]]; then
  exit 0
fi

case "$FILE_PATH" in
  *.rb)
    if command -v rubocop &>/dev/null; then
      rubocop --format simple --fail-level error "$FILE_PATH" 2>/dev/null || true
    fi
    ;;
  *.sh)
    if command -v shfmt &>/dev/null; then
      shfmt -d "$FILE_PATH" 2>/dev/null || true
    fi
    ;;
  *.json)
    if command -v jq &>/dev/null; then
      jq empty "$FILE_PATH" 2>/dev/null || echo "WARN: Invalid JSON in $FILE_PATH"
    fi
    ;;
  *.yaml|*.yml)
    if command -v yq &>/dev/null; then
      yq eval '.' "$FILE_PATH" >/dev/null 2>/dev/null || echo "WARN: Invalid YAML in $FILE_PATH"
    fi
    ;;
esac

exit 0
