#!/bin/bash
# Validate PR body contains required [[[ ]]] brackets.
#
# Checks both inline --body and --body-file usage.
# When --body-file is used, reads the file to check for brackets.

# Read JSON from stdin
input=$(cat)

# Extract the command from tool_input
command=$(echo "$input" | jq -r '.tool_input.command // ""')

# Only check gh pr create commands
if ! echo "$command" | grep -q "gh pr create"; then
	exit 0
fi

# Only enforce brackets if the repo's PR template uses them
pr_template=""
for path in .github/PULL_REQUEST_TEMPLATE.md .github/pull_request_template.md PULL_REQUEST_TEMPLATE.md pull_request_template.md; do
	if [ -f "$path" ]; then
		pr_template="$path"
		break
	fi
done
if [ -z "$pr_template" ] || ! grep -qE '\[{3}' "$pr_template"; then
	exit 0
fi

# Determine where the body content lives
body_text=""

# Check for --body-file <path>
body_file=$(echo "$command" | grep -oE '\-\-body-file\s+[^ ]+' | awk '{print $2}')
if [ -n "$body_file" ]; then
	# Strip quotes if present
	body_file=$(echo "$body_file" | sed "s/^['\"]//; s/['\"]$//")
	if [ -f "$body_file" ]; then
		body_text=$(cat "$body_file")
	else
		# File doesn't exist yet or path is dynamic — can't validate, allow it
		exit 0
	fi
else
	# Inline --body: check the command string itself
	body_text="$command"
fi

# Check for bracket pattern
if ! echo "$body_text" | grep -qE '\[{3}' || ! echo "$body_text" | grep -qE '\]{3}'; then
	cat >&2 <<-'EOF'

	# [FAIL]: /write-pr-description (@../SKILL.md)
	------------------------------------------
	# [ERROR]: PR body missing required [[[ and ]]] brackets from template.
	# [REASON]: Triple bracket blocks are parsed into our CHANGELOG. Omitting them is strictly disallowed.
	# [FIX]:
	#	 - The brackets MUST be present in the PR body, AND
	#	 - The brackets MUST enclose these fields:

	[[[
	**jira:** ...
	**what:** ...
	**why:** ...
	**who:** ...
	]]]
	EOF
	exit 2
fi

exit 0
