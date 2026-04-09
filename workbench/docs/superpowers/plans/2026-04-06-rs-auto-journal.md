# rs-auto-journal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a topic-scoped daily journal skill that gathers activity from 7 sources, drafts an entry, gets user confirmation, and appends to a Notion running page.

**Architecture:** A single Claude Code skill (`rs-auto-journal`) with a `config.json` topic registry. The SKILL.md instructs Claude to dispatch parallel subagents for data collection, synthesize results into a journal entry, present for interactive editing, then save to Notion. Cron scheduling provides daily automation with manual fallback.

**Tech Stack:** Claude Code skill (SKILL.md + config.json), MCP tools (Notion, Slack, Jira, Glean), gh CLI, CronCreate, AskUserQuestion

---

## File Structure

```
~/.claude/skills/rs-auto-journal/
  SKILL.md        # Main skill — collection, drafting, interaction, save logic
  config.json     # Topic registry with keywords, Notion page IDs, section toggles
```

- `SKILL.md` — single file containing all skill logic (collection pipeline, drafting instructions, interactive loop, Notion save, setup flow, cron registration)
- `config.json` — data-only config, one entry per topic

---

### Task 1: Create config.json with empty topic registry

**Files:**

- Create: `~/.claude/skills/rs-auto-journal/config.json`

- [ ] **Step 1: Create the skill directory**

```bash
mkdir -p ~/.claude/skills/rs-auto-journal
```

- [ ] **Step 2: Write config.json with defaults and empty topics**

```json
{
  "topics": {},
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

- [ ] **Step 3: Commit**

```bash
git add ~/.claude/skills/rs-auto-journal/config.json
git commit -m "feat(rs-auto-journal): add config.json with topic registry schema"
```

---

### Task 2: Write SKILL.md — Frontmatter and Argument Parsing

**Files:**

- Create: `~/.claude/skills/rs-auto-journal/SKILL.md`

This task writes the frontmatter, overview, and argument parsing section. The skill accepts `setup`, `<topic-name>`, and `<topic-name> <date>` as arguments.

- [ ] **Step 1: Write the frontmatter and overview**

```markdown
---
name: rs-auto-journal
description: Use when journaling about a topic, capturing daily activity, or running the scheduled morning journal. Gathers data from Slack, Jira, GitHub, Glean, meetings, and Claude sessions, drafts an entry, and appends to a Notion running page.
argument-hint: "[setup | topic-name [YYYY-MM-DD]]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Agent
  - AskUserQuestion
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
```

- [ ] **Step 2: Write the argument parsing section**

Append to SKILL.md:

```markdown
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
```

- [ ] **Step 3: Commit**

```bash
git add ~/.claude/skills/rs-auto-journal/SKILL.md
git commit -m "feat(rs-auto-journal): add SKILL.md with frontmatter and argument parsing"
```

---

### Task 3: Write SKILL.md — Data Collection Pipeline

**Files:**

- Modify: `~/.claude/skills/rs-auto-journal/SKILL.md`

This task adds the parallel data collection instructions. The skill dispatches 7 subagents concurrently, each querying one source.

- [ ] **Step 1: Write the collection pipeline section**

Append to SKILL.md:

```markdown
## Data Collection

For each topic, dispatch **7 parallel subagents** using the Agent tool. Each subagent queries one source for the target date, filtered by the topic's keywords. Use `model: "haiku"` for all collector subagents to save tokens.

**IMPORTANT:** Launch all 7 Agent calls in a SINGLE message for true parallelism.

Each subagent prompt must include:

- The topic keywords (OR-joined for search queries)
- The target date (YYYY-MM-DD)
- Instructions to return structured markdown with source links

### Source 1: Glean Activity
```

Use mcp**glean**user_activity with:

- start_date: "<target-date>"
- end_date: "<target-date>"

Filter results to items matching keywords: <keywords>.
Return as markdown bullet list with document titles, URLs, and action type (created/edited/viewed).
If no results match keywords, return "NO_DATA".

```

### Source 2: Glean Meetings

```

Use mcp**glean**meeting_lookup with:

- query: "<keywords> after:<target-date> before:<day-after-target>"

Return as markdown: meeting title, participants, and key excerpts matching keywords.
If no meetings found, return "NO_DATA".

```

### Source 3: Slack

```

Use mcp**slack**slack_search_public_and_private with:

- query: "<keywords> on:<target-date>"
- sort: "timestamp"
- limit: 20

Return as markdown bullet list: message text (truncated to 200 chars), author, channel, permalink.
If no messages found, return "NO_DATA".

```

### Source 4: Jira

```

Use mcp**jiraconfluence**searchJiraIssuesUsingJql with:

- jql: "text ~ \"<keyword1>\" OR text ~ \"<keyword2>\" AND updated >= \"<target-date>\" AND updated < \"<day-after-target>\""

Return as markdown: issue key, title, status, status change if any, link.
If no issues found, return "NO_DATA".

```

### Source 5: GitHub

```

Run via Bash:
gh pr list --author=@me --search="<keywords>" --state=all --json title,url,state,updatedAt \
 | jq '[.[] | select(.updatedAt | startswith("<target-date>"))]'

Also check commits:
git log --author="$(git config user.name)" --after="<target-date>T00:00:00" --before="<day-after-target>T00:00:00" --oneline --grep="<keyword1>\|<keyword2>"

Return as markdown: PR titles with URLs, commit messages.
If nothing found, return "NO_DATA".

```

### Source 6: Glean Code Search

```

Use mcp**glean**code_search with:

- query: "<keywords> owner:me updated:after:<target-date>"

Return as markdown: file paths, repo names, change descriptions.
If no results, return "NO_DATA".

```

### Source 7: Claude Sessions

```

Use the eng-workflow:search-conversations skill with keywords "<keywords>".
Filter to conversations from <target-date>.
Return as markdown: conversation summaries with timestamps.
If no sessions found, return "NO_DATA".

```

### After Collection

Gather all 7 subagent results. Discard any that returned "NO_DATA". If ALL sources returned NO_DATA, tell the user:

> "No activity found for [topic] on [date]. Want to write a manual entry anyway?"

If they decline, stop. If they accept, skip to the Interactive Loop with an empty draft.
```

- [ ] **Step 2: Commit**

```bash
git add ~/.claude/skills/rs-auto-journal/SKILL.md
git commit -m "feat(rs-auto-journal): add 7-source parallel data collection pipeline"
```

---

### Task 4: Write SKILL.md — Drafting and Journal Format

**Files:**

- Modify: `~/.claude/skills/rs-auto-journal/SKILL.md`

This task adds the instructions for synthesizing collected data into the journal entry format.

- [ ] **Step 1: Write the drafting section**

Append to SKILL.md:

```markdown
## Drafting the Entry

Using the collected data, draft a journal entry in this exact format:
```

## <Month Day> — <Topic Name>

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

````

- [ ] **Step 2: Commit**

```bash
git add ~/.claude/skills/rs-auto-journal/SKILL.md
git commit -m "feat(rs-auto-journal): add journal entry drafting and format template"
````

---

### Task 5: Write SKILL.md — Interactive Loop

**Files:**

- Modify: `~/.claude/skills/rs-auto-journal/SKILL.md`

This task adds the interactive confirmation loop where the user reviews and edits before saving.

- [ ] **Step 1: Write the interactive loop section**

Append to SKILL.md:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add ~/.claude/skills/rs-auto-journal/SKILL.md
git commit -m "feat(rs-auto-journal): add interactive review loop before save"
```

---

### Task 6: Write SKILL.md — Notion Save

**Files:**

- Modify: `~/.claude/skills/rs-auto-journal/SKILL.md`

This task adds the Notion save logic — appending the entry to the running page.

- [ ] **Step 1: Write the Notion save section**

Append to SKILL.md:

```markdown
## Save to Notion

After user confirms the entry:

**Step 1:** Fetch the current page content:

Use `mcp__notion__notion-fetch` with the topic's `notion_page_id` from config to verify the page exists.

If the page is not found, tell the user:

> "Notion page not found for this topic. Run `/rs-auto-journal setup` to configure it."

**Step 2:** Append the entry:

Use `mcp__notion__notion-update-page` with:

- page_id: the topic's `notion_page_id`
- command: "update_content"
- content: the full journal entry markdown (appended to existing content)

**Step 3:** Confirm to the user:

> "Journal entry saved to Notion for [topic] on [date]."

If saving fails, show the error and offer to retry or copy the entry to clipboard.
```

- [ ] **Step 2: Commit**

```bash
git add ~/.claude/skills/rs-auto-journal/SKILL.md
git commit -m "feat(rs-auto-journal): add Notion save with page append logic"
```

---

### Task 7: Write SKILL.md — Setup Flow

**Files:**

- Modify: `~/.claude/skills/rs-auto-journal/SKILL.md`

This task adds the setup flow for adding new topics.

- [ ] **Step 1: Write the setup flow section**

Append to SKILL.md:

````markdown
## Setup Flow

When invoked with `setup` argument:

**Step 1:** Ask for topic details using AskUserQuestion:

> "Let's set up a new journal topic. What should I call it? (e.g., tiger-team, q2-launch, oncall)"

**Step 2:** Ask for keywords:

> "What keywords should I search for across Slack, Jira, GitHub, and meetings? (comma-separated, e.g., 'tiger team, beneficiaries epic')"

**Step 3:** Create the Notion running page:

Use `mcp__notion__notion-create-pages` to create a new page:

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
    "database_id": "<documents-database-id-from-rs-notion-save-config>"
  }
}
```
````

Read the documents database ID from `~/.claude/skills/rs-notion-save/config.json`.

**Step 4:** Save to config.json:

Read the current config.json, add the new topic:

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

**Step 5:** Register the cron job:

Use CronCreate with:

- cron: the defaults.cron_time from config (default "0 9 \* \* 1-5")
- prompt: "Run /rs-auto-journal"
- recurring: true

Tell the user:

> "Topic '[name]' configured! Cron registered for weekdays at 9am. You can also run `/rs-auto-journal <topic-name>` manually anytime."

````

- [ ] **Step 2: Commit**

```bash
git add ~/.claude/skills/rs-auto-journal/SKILL.md
git commit -m "feat(rs-auto-journal): add setup flow with Notion page creation and cron registration"
````

---

### Task 8: Write SKILL.md — Cron Registration and Multi-Topic Handling

**Files:**

- Modify: `~/.claude/skills/rs-auto-journal/SKILL.md`

This task adds cron re-registration logic and multi-topic sequential processing.

- [ ] **Step 1: Write the cron and multi-topic section**

Append to SKILL.md:

```markdown
## Cron Registration

On every manual invocation, check if the cron is active:

Use CronList to check for an existing rs-auto-journal cron. If none found:

1. Register via CronCreate with the defaults.cron_time from config
2. Notify user: "Cron re-registered (it auto-expires after 7 days)."

## Multi-Topic Processing

When invoked with no topic argument (all active topics):

1. Read config.json and get all topic keys
2. Process each topic **sequentially** (one interactive loop per topic)
3. For each topic: collect → draft → interactive loop → save
4. After all topics, summarize: "Journaled N topics: [list]"
```

- [ ] **Step 2: Commit**

```bash
git add ~/.claude/skills/rs-auto-journal/SKILL.md
git commit -m "feat(rs-auto-journal): add cron re-registration and multi-topic handling"
```

---

### Task 9: Manual Smoke Test

**Files:**

- No file changes — this is a verification task

- [ ] **Step 1: Verify skill is discoverable**

```bash
ls -la ~/.claude/skills/rs-auto-journal/
```

Expected: `SKILL.md` and `config.json` both present.

- [ ] **Step 2: Read SKILL.md end-to-end**

Read the full SKILL.md and verify:

- Frontmatter has name, description, argument-hint, allowed-tools
- All 7 data sources are documented with exact tool names and query patterns
- Journal format template is complete
- Interactive loop instructions are clear
- Notion save references the correct MCP tool
- Setup flow includes Notion page creation, config update, and cron registration
- Cron re-registration logic is present
- Multi-topic handling is documented

- [ ] **Step 3: Verify config.json is valid JSON**

```bash
cat ~/.claude/skills/rs-auto-journal/config.json | jq .
```

Expected: valid JSON with `topics` (empty object) and `defaults` with all fields.

- [ ] **Step 4: Run setup for tiger-team topic**

Invoke `/rs-auto-journal setup` and walk through the setup flow to create the Tiger Team topic. This is the real end-to-end test.

- [ ] **Step 5: Run the journal for tiger-team**

Invoke `/rs-auto-journal tiger-team` and verify:

- Data is collected from available sources
- Draft is presented with summary + raw evidence
- User can add reflections
- Entry is saved to Notion

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "test(rs-auto-journal): verify skill setup and first journal run"
```

---

## Task Dependency Graph

```
Task 1 (config.json) ─┐
                       ├→ Task 3 (collection) ─→ Task 4 (drafting) ─→ Task 5 (interactive) ─→ Task 6 (save) ─┐
Task 2 (frontmatter) ─┘                                                                                       ├→ Task 8 (cron + multi) ─→ Task 9 (smoke test)
                                                                                                               │
                                                                                            Task 7 (setup) ───┘
```

- Tasks 1 + 2 can run in parallel (independent files)
- Tasks 3-6 are sequential (each appends to SKILL.md, building on previous sections)
- Task 7 can run in parallel with Tasks 5-6 (appends independently)
- Task 8 depends on Tasks 6 + 7
- Task 9 depends on all previous tasks
