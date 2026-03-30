#!/usr/bin/env bash
# shellcheck disable=SC2154,SC2016
# encourage-source-dir.sh — PreToolUse hook for Claude Code
#
# Warns agents when writing to chezmoi-managed destination files in ~/
# instead of editing source files in the project's home/ directory.
#
# SC2154: tool_name, file_path, command are assigned by eval
# SC2016: $HOME in single quotes is intentional (grep pattern, not expansion)

set -euo pipefail

ORIG_HOME="$HOME"
HOME=$(realpath "$HOME")
CLAUDE_PROJECT_DIR=$(realpath "${CLAUDE_PROJECT_DIR:-.}")

input=$(cat)

eval "$(echo "$input" | jq -r '
  @sh "tool_name=\(.tool_name // "")",
  @sh "file_path=\(.tool_input.file_path // "")",
  @sh "command=\(.tool_input.command // "")"
')"

resolve_path() {
	local p="$1"
	if [[ -e "$p" ]]; then
		realpath "$p"
	elif [[ -d "$(dirname "$p")" ]]; then
		echo "$(realpath "$(dirname "$p")")/$(basename "$p")"
	else
		echo "$p"
	fi
}

is_home_not_project() {
	local resolved="$1"
	[[ "$resolved" == "$HOME"/* ]] &&
		[[ "$resolved" != "$CLAUDE_PROJECT_DIR"/* ]] &&
		[[ "$resolved" != "$HOME/.claude"/* ]]
}

case "$tool_name" in
Write | Edit | MultiEdit)
	[[ -z "$file_path" ]] && exit 0
	resolved=$(resolve_path "$file_path")
	if is_home_not_project "$resolved"; then
		jq -n --arg ctx "$(
			cat <<MSG
Warning: You are editing a file outside the chezmoi source tree. If this is a
chezmoi-managed destination file, edit the source instead:
  chezmoi source-path $resolved
MSG
		)" '{additionalContext: $ctx}'
	fi
	;;

Read)
	[[ -z "$file_path" ]] && exit 0
	resolved=$(resolve_path "$file_path")
	if is_home_not_project "$resolved"; then
		jq -n --arg ctx "$(
			cat <<MSG
Note: You are reading a chezmoi-managed destination file. This is deployed from
the source tree — do not edit it directly. To find the source file, run:
  chezmoi source-path $resolved
MSG
		)" '{additionalContext: $ctx}'
	fi
	;;

Bash)
	[[ -z "$command" ]] && exit 0

	stripped=$(echo "$command" | sed 's/^[[:space:]]*//' | sed 's/^[A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]*//')
	while [[ "$stripped" =~ ^[A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]] ]]; do
		# shellcheck disable=SC2001
		stripped=$(echo "$stripped" | sed 's/^[A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]*//')
	done
	if [[ "$stripped" == chezmoi* ]]; then
		exit 0
	fi

	if echo "$command" | grep -qF "$HOME/" ||
		echo "$command" | grep -qF "$ORIG_HOME/" ||
		echo "$command" | grep -qE '(~/|\$HOME/)'; then
		jq -n --arg ctx "$(
			cat <<MSG
Note: This command references files in ~/. This is a chezmoi-managed repo — do
not modify files in ~/ directly. To find source files, use:
  chezmoi source-path <target>
MSG
		)" '{additionalContext: $ctx}'
	fi
	;;
esac
