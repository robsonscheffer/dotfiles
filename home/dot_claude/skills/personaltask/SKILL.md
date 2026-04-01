---
name: personaltask
description: Generic idea-to-PR pipeline - creates a Jira subtask, plans, branches, implements, and opens a PR. Requires a wrapper skill to supply org-specific config (Jira instance, project, parent ticket, account ID, transition IDs). Triggers on "personaltask", "quick task", or "spin up a ticket".
---

# Personal Task: Idea to PR Pipeline

End-to-end automation: idea -> Jira ticket -> plan -> branch -> implementation -> commit -> PR.

## Required Config

This skill expects the calling wrapper to define these values before invoking. If any are missing, stop and ask the user.

| Variable                      | Description                   | Example               |
| ----------------------------- | ----------------------------- | --------------------- |
| `JIRA_CLOUD_ID`               | Jira cloud instance           | `myorg.atlassian.net` |
| `JIRA_PROJECT_KEY`            | Project key                   | `PROJ`                |
| `JIRA_PARENT_TICKET`          | Parent ticket for subtasks    | `PROJ-100`            |
| `JIRA_ASSIGNEE_ACCOUNT_ID`    | Jira accountId to assign      | `712020:abc123`       |
| `JIRA_TRANSITION_IN_PROGRESS` | Transition ID for In Progress | `31`                  |
| `JIRA_TRANSITION_DONE`        | Transition ID for Done        | `41`                  |

## Modes

Parse the mode from the argument. Default is **implement** if no mode is specified.

| Mode          | Trigger           | What it does                                                          |
| ------------- | ----------------- | --------------------------------------------------------------------- |
| **todo**      | `todo <idea>`     | Steps 1-3 only: create ticket, plan, update description. No code.     |
| **start**     | `start <idea>`    | Steps 1-4: everything in todo + create feature branch. Ready to code. |
| **implement** | `<idea>`          | Steps 1-8: full pipeline from idea to PR. (default)                   |
| **resume**    | `resume [TICKET]` | Resume work on an existing ticket. See Step 9.                        |
| **finish**    | `finish [TICKET]` | Move Jira ticket to Done. See Step 10.                                |

## Process

### Step 1: Create and Assign Jira Subtask

The user provides an idea as the skill argument. If no idea is provided, ask for one.

Create a Sub-task under `JIRA_PARENT_TICKET` using `mcp__jira__createJiraIssue`:

- **cloudId:** `JIRA_CLOUD_ID`
- **projectKey:** `JIRA_PROJECT_KEY`
- **issueTypeName:** `Sub-task`
- **parent:** `JIRA_PARENT_TICKET`
- **summary:** The idea title (clean it up if needed)
- **description:** `Planning in progress...`

Then immediately (no confirmation needed):

- Transition to **In Progress** via `mcp__jira__transitionJiraIssue` with `{"id": "JIRA_TRANSITION_IN_PROGRESS"}`
- Assign via `mcp__jira__editJiraIssue` with accountId `JIRA_ASSIGNEE_ACCOUNT_ID`

Announce the created ticket key as a clickable hyperlink: `[TICKET-KEY](https://JIRA_CLOUD_ID/browse/TICKET-KEY)`.

### Step 2: Brainstorm and Plan

Invoke the `brainstorming` skill to explore the idea, then `writing-plans` to produce a concrete implementation plan. Keep it focused and practical.

### Step 3: Update Jira Description

Update the ticket description via `mcp__jira__editJiraIssue` with the plan formatted in Jira markdown (overview, key changes, risks).

**STOP here if mode is `todo`.** Announce the ticket key and summarize the plan.

### Step 4: Create Feature Branch

Create a feature branch named `TICKET-KEY-short-description` from `main`. Use a git worktree if available to avoid disrupting the current working directory.

**STOP here if mode is `start`.** Announce the ticket key, branch name, and plan summary.

### Step 5: Implement

Execute the plan. If the plan has multiple independent steps, use subagents to parallelize. Follow all standard development practices (write tests, run tests, run linters).

### Step 6: Code Review

Once implementation is complete and tests pass, do a self-review of the diff. Fix any critical or important issues before proceeding.

### Step 7: Commit and Create PR

After code review passes:

1. Do NOT stage planning/brainstorming documents. Only commit source code, tests, and config changes.
2. Generate a conventional commit message, then commit.
3. Push the branch: `git push -u origin HEAD`
4. Generate a PR description and create the PR using `gh pr create`. If a PR already exists, update it with `gh pr edit`.
5. Update the Jira ticket description via `mcp__jira__editJiraIssue` to append the PR URL as a link at the top.
6. Announce the PR URL as a clickable link.

### Step 8: Summary

Announce a final summary with clickable links:

- Jira: `[TICKET-KEY](https://JIRA_CLOUD_ID/browse/TICKET-KEY)`
- PR: the GitHub PR URL
- Branch: the branch name

### Step 9: Resume (resume mode only)

Skips Steps 1-4. Pick up work on an existing ticket/branch. Detect the ticket key using this fallback chain:

1. **Argument:** If passed (e.g., `resume PROJ-1234`), use it.
2. **Branch name:** Extract `JIRA_PROJECT_KEY-XXXX` from `git branch --show-current`.
3. **Ask the user** if none found.

Then:

1. Fetch the ticket description via `mcp__jira__getJiraIssue` to recover the plan.
2. Check for an existing worktree/branch. If no local branch exists, check it out from origin.
3. Assess current state: review `git log`, `git diff`, and `git status` to understand what has already been done.
4. Present a brief status summary and ask the user what to work on next, or continue from where the plan left off.
5. Proceed with Steps 5-8 as needed.

### Step 10: Finish (finish mode only)

Skips Steps 1-9. Detect the ticket key using this fallback chain:

1. **Argument:** If passed (e.g., `finish PROJ-1234`), use it.
2. **Branch name:** Extract `JIRA_PROJECT_KEY-XXXX` from `git branch --show-current`.
3. **PR description:** Extract from `gh pr view --json body,title -q '.title + " " + .body'`.
4. **Ask the user** if none found.

Transition to **Done** via `mcp__jira__transitionJiraIssue` with `{"id": "JIRA_TRANSITION_DONE"}`. Announce completion.

## Quick Reference

| Step                | Tool/Skill                                           | Purpose                                 |
| ------------------- | ---------------------------------------------------- | --------------------------------------- |
| Create ticket       | `mcp__jira__createJiraIssue`                         | Jira subtask under `JIRA_PARENT_TICKET` |
| Assign + transition | `mcp__jira__transitionJiraIssue` + `editJiraIssue`   | In Progress, assign                     |
| Plan                | `brainstorming` + `writing-plans` skills             | Work out approach                       |
| Update ticket       | `mcp__jira__editJiraIssue`                           | Add plan to description                 |
| Branch              | git checkout / worktree                              | Feature branch from main                |
| Implement           | `executing-plans` skill                              | Execute the plan                        |
| Commit              | `eng-workflow:generate-commit-message`               | Commit message + commit                 |
| PR                  | `eng-workflow:write-pr-description` + `gh pr create` | Generate description and open PR        |
| Link PR to Jira     | `mcp__jira__editJiraIssue`                           | Append PR URL to ticket description     |
| Resume              | `mcp__jira__getJiraIssue` + git                      | Recover plan, assess state, continue    |
| Finish              | `mcp__jira__transitionJiraIssue`                     | Move to Done                            |
