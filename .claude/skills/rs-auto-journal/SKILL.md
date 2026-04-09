---
name: rs-auto-journal
description: Use when journaling about a topic, capturing daily activity, or running the scheduled morning journal. Also triggered by the 9am weekday cron.
argument-hint: "[setup | topic-name [YYYY-MM-DD]]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Agent
  - AskUserQuestion
  - Skill
  - Bash(gh pr list:*)
  - Bash(gh pr view:*)
  - Bash(git log:*)
  - Bash(date:*)
  - mcp__glean__user_activity
  - mcp__glean__meeting_lookup
  - mcp__glean__search
  - mcp__glean__code_search
  - mcp__slack__slack_search_public_and_private
  - mcp__jiraconfluence__searchJiraIssuesUsingJql
  - mcp__notion__notion-update-page
  - mcp__notion__notion-create-pages
  - mcp__notion__notion-fetch
  - mcp__notion__notion-search
  - CronCreate
  - CronList
---

# Auto Journal

**Config:** Read [config.json](config.json) before proceeding.

Topic-scoped daily journal. Gathers activity from multiple sources, drafts an entry, asks for your reflections, and appends to a Notion running page.

## Argument Parsing

Parse the command arguments:

- **No arguments** → journal yesterday for ALL active topics in config
- **`setup`** → run Setup flow (see below)
- **`<topic-name>`** → journal yesterday for that specific topic
- **`<topic-name> <YYYY-MM-DD>`** → journal that specific date for that topic

If the topic name is not found in config.json, say: "Topic '[name]' not found. Run `/rs-auto-journal setup` to add it."

Resolve the target date:

- "yesterday" → use `date -v-1d +%Y-%m-%d` (macOS) to get yesterday's date
- Explicit date → validate format is YYYY-MM-DD

## Data Collection

For each topic, dispatch **6 parallel subagents** using the Agent tool, plus 1 main-thread query. Each subagent queries one source for the target date, filtered by the topic's keywords. Use `model: "haiku"` for all collector subagents to save tokens.

**IMPORTANT:** Launch all 6 Agent calls in a SINGLE message for true parallelism. Source 7 (Claude Sessions) runs in the main thread because subagents cannot invoke skills.

Each subagent prompt must include:

- The topic keywords (OR-joined for search queries)
- The target date (YYYY-MM-DD)
- Instructions to return structured markdown with source links

### Source 1: Glean Activity

Use `mcp__glean__user_activity` with:

- start_date: `<target-date>`
- end_date: `<day-after-target>` (end_date is exclusive)

Filter results to items matching keywords. Return as markdown bullet list with document titles, URLs, and action type (created/edited/viewed). If no results match keywords, return "NO_DATA".

### Source 2: Glean Meetings

Use `mcp__glean__meeting_lookup` with:

- query: `<keywords> after:<target-date> before:<day-after-target>`

Return as markdown: meeting title, participants, and key excerpts matching keywords. If no meetings found, return "NO_DATA".

### Source 3: Slack

Use `mcp__slack__slack_search_public_and_private` with:

- query: `<keywords> on:<target-date>`
- sort: "timestamp"
- limit: 20

Return as markdown bullet list: message text (truncated to 200 chars), author, channel, permalink. If no messages found, return "NO_DATA".

### Source 4: Jira

Use `mcp__jiraconfluence__searchJiraIssuesUsingJql` with:

- jql: `(text ~ "<keyword1>" OR text ~ "<keyword2>") AND updated >= "<target-date>" AND updated < "<day-after-target>"`

Return as markdown: issue key, title, status, status change if any, link. If no issues found, return "NO_DATA".

### Source 5: GitHub

Run via Bash:

```bash
gh pr list --author=@me --search="<keywords>" --state=all --json title,url,state,updatedAt \
  | jq '[.[] | select(.updatedAt | startswith("<target-date>"))]'
```

Also check commits:

```bash
git log --author="$(git config user.name)" --after="<target-date>T00:00:00" --before="<day-after-target>T00:00:00" --oneline --grep="<keyword1>\|<keyword2>"
```

Return as markdown: PR titles with URLs, commit messages. If nothing found, return "NO_DATA".

### Source 6: Glean Code Search

Use `mcp__glean__code_search` with:

- query: `<keywords> owner:me updated:after:<target-date>`

Return as markdown: file paths, repo names, change descriptions. If no results, return "NO_DATA".

### Source 7: Claude Sessions (main thread)

**Do NOT dispatch this as a subagent** — subagents cannot invoke skills.

After dispatching the 6 subagents above, run this in the main thread while waiting for results:

Use the `eng-workflow:search-conversations` skill with the topic keywords. Filter to conversations from the target date. Collect conversation summaries with timestamps. If no sessions found, treat as "NO_DATA".

### After Collection

Gather all 7 subagent results. Discard any that returned "NO_DATA". If ALL sources returned NO_DATA, tell the user:

> "No activity found for [topic] on [date]. Want to write a manual entry anyway?"

If they decline, stop. If they accept, skip to the Interactive Loop with an empty draft.

## Drafting the Entry

Using the collected data, draft a journal entry in this exact format:

### Entry Template

**Computing Day N:** Fetch the existing Notion page content (from the Save step's fetch) and count how many `## ` entry headings (h2 level) already exist, then add 1. Defaults to 1 if none exist.

```
## <Month Day> — <Topic Name>: Day <N>

### Summary
<Synthesize a 3-5 sentence narrative from ALL collected evidence. Focus on: what was worked on, what progressed, what was discussed. Write in first person ("I worked on...", "We discussed..."). Be specific — mention actual ticket numbers, PR names, people.>

### Decisions Made
<Extract concrete decisions from Slack threads, Jira status changes, meeting notes, and PR merges. Each as a bullet point. If no clear decisions found, write "- None identified — review raw evidence below">

### What Surprised Me
- [Your turn — what was unexpected?]

### What I'd Do Differently
- [Your turn — any process improvements?]

---

<details>
<summary>Raw Evidence</summary>

<For each source that returned data, add a section:>

#### Slack
- <message excerpts with permalinks>

#### Jira
- <ticket updates with links>

#### GitHub
- <PRs and commits with links>

#### Meetings
- <meeting titles with key excerpts>

#### Claude Sessions
- <conversation summaries>

#### Glean Activity
- <documents touched>

</details>
```

**Rules:**

- Only include source sections that have data (skip empty ones)
- Never fill in the "What Surprised Me" or "What I'd Do Differently" sections — these are always left for the user
- Keep the Summary concise but specific — no vague filler
- Raw Evidence should include links/permalinks wherever available

## Interactive Loop

After drafting, present the entry and ask for user input. Use AskUserQuestion for this.

**Step 1:** Display the full drafted entry in the terminal (formatted markdown).

**Step 2:** Ask:

> "Here's your journal draft for [topic] on [date]. You can:
>
> - Add your reflections to the blank sections
> - Correct anything in the summary or decisions
> - Say 'looks good' to save as-is
>
> What would you like to change?"

**Step 3:** Process the response:

- If "looks good", "save", "lgtm", or similar → proceed to Save
- If they provide edits → incorporate their changes into the entry, show the updated version, and ask again
- Loop until they confirm

**IMPORTANT:** Never save to Notion without explicit user confirmation.

## Save to Notion

After user confirms the entry:

**Step 1:** Fetch the current page content using `mcp__notion__notion-fetch` with the topic's `notion_page_id` from config to verify the page exists.

If the page is not found, tell the user:

> "Notion page not found for this topic. Run `/rs-auto-journal setup` to configure it."

**Step 2:** Append the entry using `mcp__notion__notion-update-page` with:

- page_id: the topic's `notion_page_id`
- command: "update_content"
- content_updates: find the last `---` separator in the existing page content and insert the new entry after it

Example:

```json
{
  "page_id": "<notion_page_id>",
  "command": "update_content",
  "content_updates": [
    {
      "old_str": "<last --- separator in existing content>",
      "new_str": "<last --- separator>\n\n<full journal entry markdown>"
    }
  ]
}
```

If the page has no `---` separator, use `replace_content` instead to set the full page content (existing + new entry).

**Step 3:** Confirm to the user:

> "Journal entry saved to Notion for [topic] on [date]."

If saving fails, show the error and offer to retry or copy the entry to clipboard.

## Setup Flow

When invoked with `setup` argument:

**Step 1:** Ask for topic details using AskUserQuestion:

> "Let's set up a new journal topic. What should I call it? (e.g., tiger-team, q2-launch, oncall)"

**Step 2:** Ask for keywords:

> "What keywords should I search for across Slack, Jira, GitHub, and meetings? (comma-separated, e.g., 'tiger team, beneficiaries epic')"

**Step 3:** Create the Notion running page using `mcp__notion__notion-create-pages`:

```json
{
  "pages": [
    {
      "properties": {
        "Title": "<Topic Name> — Journal"
      },
      "content": "# <Topic Name> — Journal\n\nDaily journal entries are appended below.\n\n---\n"
    }
  ],
  "parent": {
    "database_id": "<documents-database-id>"
  }
}
```

Read the documents database ID from `~/.claude/skills/rs-notion-save/config.json`.

**Step 4:** Save to config.json — read the current config, add the new topic entry:

```json
{
  "<topic-name>": {
    "keywords": ["<keyword1>", "<keyword2>"],
    "notion_page_id": "<created-page-id>",
    "journal_date": "yesterday",
    "sections": {
      "summary": true,
      "decisions": true,
      "surprises": true,
      "would_change": true
    }
  }
}
```

Write the updated config.json.

**Step 5:** Register the cron job using CronCreate with:

- cron: the `defaults.cron_time` from config (default `0 9 * * 1-5`)
- prompt: `Run /rs-auto-journal`
- recurring: true

Tell the user:

> "Topic '[name]' configured! Cron registered for weekdays at 9am. You can also run `/rs-auto-journal <topic-name>` manually anytime."

## Cron Registration

On every manual invocation, check if the cron is active:

Use CronList to check for an existing rs-auto-journal cron. If none found:

1. Register via CronCreate with the `defaults.cron_time` from config
2. Notify user: "Cron re-registered (it auto-expires after 7 days)."

## Multi-Topic Processing

When invoked with no topic argument (all active topics):

1. Read config.json and get all topic keys
2. Process each topic **sequentially** (one interactive loop per topic)
3. For each topic: collect → draft → interactive loop → save
4. After all topics, summarize: "Journaled N topics: [list]"
