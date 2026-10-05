# commit-msg-guard

A Claude Code PreToolUse hook that blocks agent commits with bloated messages.

Agents were narrating whole diffs in commit bodies. This holds them to a semantic subject and a
short why. A blocked commit exits 2, and the reason goes back to the agent, which rewrites and
retries.

## Rules

| Check | Limit |
| --- | --- |
| Subject | `type(scope): subject`, type in `feat fix refactor docs test chore style perf build ci revert` |
| Subject length | 72 chars |
| Body | 2 lines max; trailers (`Co-Authored-By:`, `Signed-off-by:`) don't count |
| Body shape | no bullet or numbered lists |

Limits are constants at the top of `hook.py`.

## Install

Registered in `~/.claude/settings.json` under the `Bash` matcher:

```json
{ "type": "command", "command": "python3 ~/.claude/hooks/commit-msg-guard/hook.py" }
```

Needs only `python3` (stdlib).

## What it sees

It reads the message straight out of the command: `-m` / `--message` (repeated flags become
paragraphs), `-am`, and heredocs (`-m "$(cat <<'EOF' ... EOF)"`), including `git -C <dir> commit`.

**Passes through unchecked:** `-F <file>`, `-C <commit>`, `--amend --no-edit`, editor commits.
It can't see those messages. It's a guardrail for agents, not a gate.

## Scope

Agent sessions only: Claude Code and Codex run it as a hook, opencode and pi through
`../run-guards.py`. Your own terminal commits never hit it. A git-level global hook
was rejected: Git 2.50 has no config-based hooks, and a global `core.hooksPath` is overridden
by per-repo hook paths (a repo's own `core.hooksPath`) while disabling `.git/hooks` everywhere else.

## Test

```bash
t(){ jq -n --arg c "$1" '{tool_input:{command:$c}}' | python3 hook.py; echo "exit $?"; }
t 'git commit -m "fix(board): stop double save"'           # exit 0
t 'git commit -m "Updated stuff"'                          # exit 2
t 'git commit -m "chore: x" -m "one
two
three"'                                                    # exit 2
```

## Related

- Rule text: `~/.claude/AGENTS.md` (Commits), `rs-commit` skill
