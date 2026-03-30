#!/usr/bin/env bash
# stop-lint-and-test.sh — Stop hook for Claude Code
#
# Runs lint checks when the agent stops and the working tree is dirty.
# Blocks the stop if checks fail, giving the agent a chance to fix issues.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

input=$(cat)

# Prevent infinite loops
stop_hook_active=$(echo "$input" | jq -r '.stop_hook_active // false')
if [[ "$stop_hook_active" == "true" ]]; then
	exit 0
fi

# Collect changed files (staged + unstaged tracked files)
files=()
while IFS= read -r f; do
	[[ -n "$f" ]] && files+=("$f")
done < <({
	git diff --name-only
	git diff --cached --name-only
} | sort -u)

# If no tracked files changed, nothing to check
if [[ ${#files[@]} -eq 0 ]]; then
	exit 0
fi

failures=""

# Lint shell scripts
for f in "${files[@]}"; do
	case "$f" in
	*.sh)
		if command -v shfmt &>/dev/null && [[ -f "$f" ]]; then
			lint_out=$(shfmt -d "$f" 2>&1) || failures="${failures}shfmt failed on $f:
${lint_out}
"
		fi
		;;
	*.json)
		if command -v jq &>/dev/null && [[ -f "$f" ]]; then
			lint_out=$(jq empty "$f" 2>&1) || failures="${failures}Invalid JSON in $f:
${lint_out}
"
		fi
		;;
	*.yaml | *.yml)
		if command -v yq &>/dev/null && [[ -f "$f" ]]; then
			lint_out=$(yq eval '.' "$f" >/dev/null 2>&1) || failures="${failures}Invalid YAML in $f:
${lint_out}
"
		fi
		;;
	esac
done

if [[ -n "$failures" ]]; then
	jq -n --arg reason "$failures" '{"decision": "block", "reason": $reason}'
else
	exit 0
fi
