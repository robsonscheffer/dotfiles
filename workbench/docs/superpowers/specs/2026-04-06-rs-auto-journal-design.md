# rs-auto-journal — Design Spec

**Date:** 2026-04-06
**Author:** Robson Scheffer + Claude

## Purpose

A reusable, topic-scoped skill that automatically gathers daily activity from multiple sources, drafts a structured journal entry, asks for user confirmation/reflections, and appends it to a running Notion page.

First use case: Tiger Team experiment journal (Beneficiaries epic).

## Core Principles

- **Topic-scoped, not channel-scoped** — queries all sources by keywords, reusable for any subject
- **Hybrid output** — AI-drafted summary + raw evidence appendix
- **Interactive before save** — always presents draft and asks for user input before writing to Notion
- **One running page per topic** — daily entries appended as sections, not separate pages

## Skill Structure

```
~/.claude/skills/rs-auto-journal/
  SKILL.md        # Main skill document
  config.json     # Topic registry
```

## Config Schema

```json
{
  "topics": {
    "tiger-team": {
      "keywords": ["tiger team", "beneficiaries epic", "beneficiaries tiger"],
      "notion_page_id": "<page-id>",
      "journal_date": "yesterday",
      "sections": {
        "summary": true,
        "decisions": true,
        "surprises": true,
        "would_change": true
      }
    }
  },
  "defaults": {
    "journal_date": "yesterday",
    "cron_time": "0 9 * * 1-5",
    "sections": {
      "summary": true,
      "decisions": true,
      "surprises": true,
      "would_change": true
    }
  }
}
```

- `keywords` — drive all source queries (OR-joined across sources)
- `notion_page_id` — the running log page to append entries to
- `journal_date` — default target date ("yesterday" for morning reflection)
- `sections` — toggleable journal sections per topic
- `cron_time` — weekdays at 9am by default
- Adding a new topic = adding a key to `topics`

## Data Collection Pipeline

Parallel subagents query 7 sources for the target date, filtered by topic keywords:

| #   | Source            | Tool                                            | Query Strategy                                            |
| --- | ----------------- | ----------------------------------------------- | --------------------------------------------------------- |
| 1   | Glean activity    | `mcp__glean__user_activity`                     | start_date/end_date = target day                          |
| 2   | Glean meetings    | `mcp__glean__meeting_lookup`                    | keywords + date filter                                    |
| 3   | Slack             | `mcp__slack__slack_search_public_and_private`   | keywords + date, sorted by timestamp                      |
| 4   | Jira              | `mcp__jiraconfluence__searchJiraIssuesUsingJql` | keywords in summary/description, updatedDate = target day |
| 5   | GitHub            | `gh` CLI                                        | PRs/commits by user on target day, filtered by keywords   |
| 6   | Glean code search | `mcp__glean__code_search`                       | keywords + owner:me + date                                |
| 7   | Claude sessions   | `eng-workflow:search-conversations` skill       | keywords, invoked via headless subagent                   |

**Empty source handling:** If a source returns nothing for that day, it is silently skipped — no empty sections in output.

## Journal Entry Format

Each entry is appended to the running Notion page:

```markdown
## April 7 — Tiger Team: Day 2

### Summary

[AI-drafted narrative synthesized from all collected evidence]

### Decisions Made

- [Extracted from Slack threads, Jira status changes, meeting notes]

### What Surprised Me

- [Left blank for user input]

### What I'd Do Differently

- [Left blank for user input]

---

<details>
<summary>Raw Evidence</summary>

#### Slack

- [message excerpts with permalinks]

#### Jira

- [ticket updates with links]

#### GitHub

- [PRs, commits with links]

#### Meetings

- [meeting titles, key excerpts]

#### Claude Sessions

- [conversation summaries with timestamps]
</details>
```

**AI drafts:** Summary, Decisions Made (from observable data)
**User fills:** What Surprised Me, What I'd Do Differently (subjective — always left blank)

## Interactive Loop

After collecting data and drafting:

1. **Present draft** in terminal with full formatted entry
2. **Ask for input:**
   > "Here's today's journal draft. Want to edit anything, add your reflections, or save as-is?"
3. **Accept user edits** — user can:
   - Add thoughts to blank sections
   - Correct the summary or decisions
   - Say "looks good" to save immediately
4. **Save to Notion** — append entry to running page via `mcp__notion__notion-update-page`

## Invocation

### Manual (slash command)

```
/rs-auto-journal                           # Yesterday, all active topics
/rs-auto-journal tiger-team                # Specific topic
/rs-auto-journal tiger-team 2026-04-03     # Specific topic + date
```

### Scheduled (cron)

- Registered via `CronCreate` during setup or first manual run
- Default: `0 9 * * 1-5` (9am weekdays)
- Prompt: runs `/rs-auto-journal` for all active topics
- Only fires when Claude Code REPL is open and idle
- Auto-expires after 7 days; skill re-registers on next manual invocation

### Setup

```
/rs-auto-journal setup
```

1. Ask for topic name + keywords
2. Create running log page in Notion
3. Register cron job via CronCreate
4. Save topic to config.json

## Integration Points

- **rs-notion-save** — reuses existing Notion database config for page creation
- **eng-workflow:search-conversations** — searches past Claude sessions by keywords
- **CronCreate** — registers daily schedule
- **Parallel subagents** — 7 data collectors run concurrently for speed

## Edge Cases

- **No data for a day** — skill reports "No activity found for [topic] on [date]" and asks if user wants to write a manual entry anyway
- **Cron expired** — re-registers on next manual run, notifies user
- **Notion page not found** — prompts user to run setup or provide new page ID
- **Multiple topics** — processes each sequentially, one interactive loop per topic
- **Weekend/holiday** — cron only fires weekdays; manual invocation works any day

## Success Criteria

1. Running `/rs-auto-journal tiger-team` produces a drafted journal entry with real data from at least 3 sources
2. User can add reflections interactively before save
3. Entry appears correctly appended on the Notion running page
4. Cron fires at 9am on a weekday when REPL is open
5. Adding a second topic to config.json works without code changes
