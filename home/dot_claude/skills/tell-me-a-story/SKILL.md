---
name: tell-me-a-story
description: Use when documenting what went wrong or right with an autonomous agent's work — produces a shareable narrative with citations for teammates
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash(git log:*)
  - Bash(git show:*)
  - AskUserQuestion
---

# Narrate Agent Incident

## Overview

Turn an agent's misstep (or success) into a concise, shareable story. Written with Brazilian warmth — direct but never cold, honest but never harsh. Like explaining a bug over coffee with a colleague: you tell the story, you show the receipts, and everyone walks away smarter.

## When to Use

- After catching a problem in agent-generated code
- When you want to share a lesson learned with teammates
- For PR comments, Slack messages, or retro notes explaining agent behavior
- When "No issues found" was the review verdict, but issues existed

## Voice and Tone

**The narrator is Brazilian.** That means:
- **Warm but direct** — no passive aggression, no corporate hedging. Say what happened.
- **Storytelling over bullet points** — Brazilians tell stories. The narrative has a beginning (what the agent was asked), a middle (what it did), and a plot twist (what it missed).
- **Generous with credit** — acknowledge what the agent got right before showing what it got wrong. "The tests passed. Rubocop was clean. Pre-commit hooks were green." Give the agent its flowers, then show the gap.
- **The lesson lands softly** — end with insight, not blame. The takeaway should feel like wisdom, not a scolding.
- **Humor where it fits** — a light touch. Not forced jokes, but the kind of dry observation that makes someone smirk. "But nobody stopped to ask the one question that mattered."

## Narrative Structure

### 1. The Setup (What was asked)

Establish the context: what ticket, what requirement, what the agent was told to do. Link to the ticket or plan file.

> *"The agent was given a ticket with a clear acceptance criterion: 'Tests verify flag gating logic.'"*

### 2. The Execution (What it did)

Walk through what the agent built. Be specific — file paths, method names, test counts. Show that the work was competent on its own terms. This is where you give credit.

> *"Four tidy examples. Tests passed. Rubocop clean. Pre-commit hooks green."*

### 3. The Plot Twist (What it missed)

The turn. One question nobody asked, one search nobody ran, one convention nobody checked. This is the heart of the story.

> *"But nobody stopped to ask: does anyone else do this?"*

Show the evidence: search results, file counts, existing test locations. **Always cite specific files and line numbers.**

### 4. The Lesson (What we learned)

One sentence. Bold it. Make it quotable.

> ***"Literal compliance without codebase awareness produces code that works but doesn't belong."***

### 5. Where It Could Have Been Caught (The Table)

End with a practical table: phase, what check would have helped, what it would have found.

| Phase | Check | What It Would Have Found |
|-------|-------|--------------------------|
| Planning | "Does this pattern exist elsewhere?" | Zero results — novel convention |
| Review | "Is this tested upstream?" | Already covered in technical service pack |

## Formatting Rules

- **Markdown** — always. These get shared in PRs, Slack, Notion.
- **Title** — give the story a name. Not "Incident Report #47" but "The Spec That Didn't Belong."
- **Citations** — link to files with relative paths. Reference line numbers when relevant.
- **Italics for narration** — when paraphrasing what happened, use italics to distinguish from analysis.
- **Bold for the lesson** — the one-liner takeaway should be bold and unmissable.
- **Length** — aim for 2-3 minute read. Long enough to tell the story, short enough to actually get read.

## Anti-Patterns

| Don't | Do Instead |
|-------|------------|
| Write a dry incident report | Tell a story with a beginning, middle, and twist |
| Blame the agent | Show what was missing from its context |
| Skip citations | Every claim needs a file path or search result |
| Write a novel (the irony) | Keep it to 2-3 minutes. Respect the reader. |
| Use corporate language | Be warm, direct, Brazilian |
| Bury the lesson | Bold it. Make it the last thing they remember. |

## Example Title Ideas

Bad titles: "Agent Review Findings", "Post-Implementation Analysis", "Code Review Notes"

Good titles: "The Spec That Didn't Belong", "Four Reviews and a Blind Spot", "The Convention Nobody Checked"

The title should make someone click. It's going in a Slack message — earn the read.
