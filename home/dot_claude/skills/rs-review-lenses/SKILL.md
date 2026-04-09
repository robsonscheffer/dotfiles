---
name: rs-review-lenses
description: Use when conducting thorough code review through multiple analytical perspectives — PR review, self-review, or examining implementation quality. Triggers on requests for deep review, multi-perspective analysis, or when standard single-pass review feels insufficient for complex changes.
---

# Review Lenses

## Overview

Review code through focused analytical lenses instead of trying to catch everything at once. Each lens examines changes from a specific perspective, runs as a parallel subagent, and findings are synthesized into a consolidated report.

## When to Use

- Reviewing a PR that touches multiple concerns (auth + DB + API)
- Self-reviewing implementation before opening a PR
- Any review where a single pass would miss depth
- Complex changes where thoroughness matters more than speed

**Not for:** Quick sanity checks, tiny PRs, or single-file changes where a glance suffices.

## Input

Flexible — provide any of:

- **PR URL**: Full workflow with metadata + diff via `fetch-pr-data.py`
- **PR number**: Same, resolves against current repo
- **Branch diff**: `git diff main...HEAD` for self-review
- **Staged changes**: `git diff --cached`
- **File path**: To a saved diff file

## Workflow

### 0. Announce (REQUIRED — before ANY other tool call)

**Do NOT call fetch-pr-data.py or any other tool until this step is complete.**

1. Rename the cmux tab (required — not optional):

```bash
cmux rename-tab --surface "$CMUX_SURFACE_ID" "Review / <TICKET_OR_PR>" 2>/dev/null || true
```

Extract the ticket number from the PR branch name or title when possible (e.g., `PROJ-1392`). Fall back to `PR-<NUMBER>` if no ticket is found.

2. Output a brief announcement to the user:

```
Reviewing **PR-<NUMBER>**: <title>
Fetching PR data and selecting lenses...
```

This keeps the user oriented while the fetch runs.

### 1. Gather Context

**For PR review** (preferred — richest context):

```bash
# Fetch comprehensive PR data: metadata + diff + CI status
python3 ~/.claude/skills/review-lenses/fetch-pr-data.py <PR_URL> --save-to /tmp/review-<PR_NUMBER>
```

This creates:

- `PR-DATA.json` — metadata (title, body, author, files with stats, commits, comments, reviews, CI checks)
- `PR.diff` — raw diff in native format (truncated at ~100KB at clean file boundaries)

Read `PR-DATA.json` for context (file list, stats, title, body). Use `PR.diff` as the diff source for subagents.

**Important:** Do NOT read the diff in the main agent context. The diff is for subagents only. Use PR-DATA.json to select lenses — file names, stats, and the PR description provide enough signal. Reading the diff in the main context wastes tokens and biases lens selection.

**For self-review / local changes:**

```bash
# Branch diff
git diff main...HEAD > /tmp/review-self.diff

# Staged changes
git diff --cached > /tmp/review-staged.diff
```

### 2. Select Lenses (3-5)

Examine the diff (and file list with stats from PR-DATA.json if available) to choose lenses based on what actually changed:

1. **Which files/modules are touched?** — DB code? Auth? APIs? UI?
2. **Nature of changes** — New feature vs refactor vs bug fix
3. **What could go wrong?** — What failures would be most impactful?
4. **What would a senior reviewer prioritize?**

**Auto-include triggers** — always select these lenses when their signals appear:

- **Feature Flag Completeness**: Any diff containing feature flag checks (`feature_enabled?`, `useFeatureFlag`, `isEnabled`, `flipper`, `LaunchDarkly`, or similar gating patterns). This lens has caught real production incidents where a flag gated only part of a feature.
- **Blast Radius**: Any diff touching routes, redirects, URL changes, permission/role checks, or `before_action` filters. Verify the change works for every user type that hits the affected path, not just the one the author had in mind.

### 3. Dispatch Parallel Subagents

**CRITICAL: ALL selected lenses MUST be dispatched as separate Agent tool calls in a SINGLE message.** Do NOT synthesize any lens findings in the main agent context. Each lens must run independently to avoid cross-contamination and to leverage parallelism.

If you selected 4 lenses, your message must contain exactly 4 Agent tool calls. Each agent gets:

````
prompt: |
  You are a senior code reviewer examining changes through the **[LENS NAME]** lens.

  ## Your Lens: [LENS NAME]
  Focus: [one-line description from lens catalog]

  ## Context
  [If PR review: "Read PR metadata from /tmp/review-<N>/PR-DATA.json for title, description, commits, and CI status."]
  [If self-review: "Branch diff against main."]

  ## Diff
  [path to diff file, e.g. /tmp/review-<N>/PR.diff]

  ## Instructions
  1. Read the diff carefully (and PR metadata if available for author intent)
  2. Examine every change ONLY through your lens perspective
  3. For each finding, extract the relevant diff snippet (5-15 lines showing the change in context)
  4. Include the diff snippet immediately after the finding description in a ```diff block
  5. Gather surrounding context (Read tool) only when the diff is genuinely ambiguous
  6. Categorize each finding by severity

  ## Diff Snippet Guidelines
  - Include 2-3 lines of context before and after the relevant change
  - Keep snippets focused (5-15 lines total) — just enough to understand the issue
  - Use the exact diff format from the file (with +/- prefixes)
  - If a finding spans multiple locations, include the most important snippet
  - For multi-file findings, include one snippet per file mentioned

  ## Severity Definitions
  **Critical** — Must fix before merge: bugs, security holes, breaking changes, data loss
  **Concern** — Should fix, not blocking: fragile code, missing edge cases, perf issues
  **Observation** — Informational: style, minor improvements, questions for the author

  ## Output Format
  ## [LENS NAME] Review

  ### Summary
  [2-3 sentences — overall assessment through this lens]

  ### Critical
  - **[file:line]** — [description and why it's critical]
    ```diff
    [relevant 5-15 lines of diff showing the change]
    ```
  (or "None")

  ### Concerns
  - **[file:line]** — [description]
    ```diff
    [relevant 5-15 lines of diff showing the change]
    ```
  (or "None")

  ### Observations
  - **[file:line]** — [note or question]
    ```diff
    [relevant 5-15 lines of diff showing the change]
    ```
  (or "None")

  ## Quality Standards
  - Be specific — cite file paths and line numbers
  - Explain WHY, not just what
  - Be proportional — style issues are not critical
  - Stay in your lane — only your lens, nothing else
  - Assume competence — ask before assuming mistakes
````

### 4. Synthesize Findings

After all subagents return:

1. **Collect** findings from each lens (including their diff snippets)
2. **Deduplicate** — same issue found by multiple lenses gets merged (keep one diff snippet)
3. **Consolidate** into a single report:

````markdown
# Review Report

## Lenses Applied

- [Lens 1]: [Why selected — 1 sentence]
- [Lens 2]: [Why selected]
  ...

## Critical Issues

- **[file:line]** — [description] _(found by: [lens])_
  ```diff
  [relevant diff snippet]
  ```
````

## Concerns

- **[file:line]** — [description] _(found by: [lens])_
  ```diff
  [relevant diff snippet]
  ```

## Observations

- **[file:line]** — [note] _(found by: [lens])_
  ```diff
  [relevant diff snippet]
  ```

## Overall Assessment

[2-3 sentences: is this safe to merge? What needs attention?]

````

### 5. Save Report

Save the consolidated report to a markdown file for future reference:

```bash
REPORT_DIR="/tmp/review-<PR_NUMBER>"
# Write the full consolidated report (from Step 4) to REVIEW.md
````

Write the report to `$REPORT_DIR/REVIEW.md` using the Write tool.

If in a cmux session, open the report for easy reading:

```bash
cmux markdown open "$REPORT_DIR/REVIEW.md" 2>/dev/null || true
```

### 6. Present to User

Summarize:

- How many findings per severity
- The most important issues (critical first)
- Overall recommendation (merge / fix first / discuss)

## Lens Catalog

### Standard Lenses (always consider)

| Lens             | Focus                                                  |
| ---------------- | ------------------------------------------------------ |
| **Requirements** | Do changes satisfy stated goals / acceptance criteria? |
| **Patterns**     | Are codebase conventions followed? Any anti-patterns?  |
| **Edge Cases**   | Error paths, null handling, boundary conditions        |
| **Cleanup**      | TODOs, debug code, commented-out code, lint issues     |

### Domain-Specific Lenses (select based on changes)

| Lens                          | When It Applies                                                                                                                                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Security**                  | Auth, input handling, crypto, secrets, permissions                                                                                                                                                                                         |
| **Performance**               | Loops, queries, caching, async, large data                                                                                                                                                                                                 |
| **Backward Compatibility**    | Public APIs, config changes, DB migrations, serialization                                                                                                                                                                                  |
| **Error Handling**            | New error paths, exception handling, validation                                                                                                                                                                                            |
| **Test Coverage**             | Ratio of test-to-impl code, untested branches                                                                                                                                                                                              |
| **Domain Correctness**        | Business logic, calculations, state machines                                                                                                                                                                                               |
| **Concurrency**               | Shared state, locks, race conditions, async coordination                                                                                                                                                                                   |
| **Data Integrity**            | DB writes, transactions, validation, consistency                                                                                                                                                                                           |
| **Observability**             | Logging, metrics, tracing, debuggability                                                                                                                                                                                                   |
| **Accessibility**             | Screen readers, keyboard nav, ARIA attributes                                                                                                                                                                                              |
| **Responsive Design**         | Mobile layouts, breakpoints, touch targets                                                                                                                                                                                                 |
| **Feature Flag Completeness** | Any change gated by a feature flag — verify the flag gates ALL related code paths (data fetching, rendering, side effects, routing), not just part of them. A partially-gated feature is worse than ungated — it creates false confidence. |
| **Blast Radius**              | Route changes, redirects, permission checks, role-dependent logic — verify changes work for ALL affected user types (admins, employees, advisors, payroll admins), not just the primary target persona.                                    |

Invent new lenses as appropriate — this catalog is not exhaustive.

## Headless / Automated Mode

When invoked non-interactively (e.g., via `claude -p`), the skill should:

1. Skip the announcement (no user to orient)
2. Save the full report to `/tmp/review-<PR_NUMBER>/REVIEW.md`
3. Open the report with `cmux markdown open` if `CMUX_SURFACE_ID` is set
4. Exit cleanly after saving

This enables dispatch from polling scripts that warm up PR reviews before the reviewer starts.

## Rules

1. Select lenses based on actual changes, not a generic checklist
2. Each lens produces independent findings — no cross-talk between subagents
3. Deduplicate when synthesizing (same issue from multiple lenses = one finding)
4. Severity reflects actual impact, not subjective preference
5. Don't over-lens — 3-5 is the sweet spot; more adds noise without depth
