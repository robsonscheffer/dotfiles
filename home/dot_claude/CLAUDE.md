# Claude Code Global Memory

Precedence: project CLAUDE.md > this file.

## Tool Preferences

- Prefer built-in tools (Read, Write, Edit, Grep, Glob) over shell equivalents.
- Use jq for JSON, yq for YAML.
- Avoid complex shell pipelines when a built-in tool does the same thing.

## macOS Portability

- No `mapfile` or `readarray` (bash 4+ only, macOS ships bash 3).
- No GNU `sed -i` — use `sed -i ''` on macOS.
- No `grep -P` — use `grep -E` for extended regex.

## Commits

- Atomic commits — one logical change per commit.
- Conventional commit format: `type: description` (feat, fix, refactor, docs, test, chore).
- Check the current branch before push. Confirm before force-push.
- Never force-push to main/master without explicit confirmation.

## Subagents

- After dispatching subagents, verify expected artifacts exist on disk.
- Don't trust a subagent's claim of success without checking files.
