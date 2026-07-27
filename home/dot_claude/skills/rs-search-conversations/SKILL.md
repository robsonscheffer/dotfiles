---
name: rs-search-conversations
description: Use when Robson wants to find, search for, or locate a past Claude Code conversation by describing what it was about. Personal copy of eng-workflow:search-conversations, not tied to the plugin marketplace.
user-invocable: true
disable-model-invocation: false
allowed-tools: [Bash]
---

# Search Conversations

Search past Claude Code conversations across all projects by description.

## Workflow

1. **Ask** what Robson is looking for (if not already provided via args).
2. **Search** `~/.claude/history.jsonl` using keywords derived from the description.
3. **Present results** with: date, project directory, first matching messages, and the exact resume command.

## Search

The history file at `~/.claude/history.jsonl` contains every user message across all projects. Each line is JSON with fields: `display` (message text), `timestamp`, `sessionId`, `project`.

**Search approach:**

- Extract 3-5 keywords from the description.
- `grep -i` the history file for each keyword.
- Cross-reference hits to find sessions where multiple keywords appear.
- For promising sessions, show surrounding messages from the same `sessionId` to confirm.

**Example searches:**

```bash
# Find sessions matching keywords
grep -i "keyword" ~/.claude/history.jsonl | jq -r '[(.timestamp / 1000 | strftime("%Y-%m-%d %H:%M")), .sessionId, .project, (.display[:150])] | @tsv'

# Get all messages from a candidate session for context
jq -r 'select(.sessionId == "SESSION_ID") | [(.timestamp / 1000 | strftime("%H:%M")), (.display[:150])] | @tsv' ~/.claude/history.jsonl
```

## Output Format

For each match, output:

```
**Date:** YYYY-MM-DD
**Project:** ~/path/to/project
**Resume from:** cd ~/path/to/project
**Resume command:** claude --resume SESSION_ID
**Matching messages:**
- "first matching message preview..."
- "second matching message preview..."
```

If multiple candidates, list them ranked by relevance.
