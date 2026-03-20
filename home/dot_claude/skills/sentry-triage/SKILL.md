---
name: sentry-triage
description: Instructions for triaging Sentry errors - search by team or paste specific issues
---

# Sentry Triage

## When to Use This Skill

- Triaging Sentry alerts as part of goalie rotation
- Investigating production errors from Sentry
- Creating or updating Jira tickets for Sentry issues
- Determining priority and SLA for production errors

## Workflow Selection

**Use the `AskUserQuestion` tool to present this choice:**

```
question: "We're going to triage Sentry issues together. How would you like to proceed?"
header: "Workflow"
options:
  - label: "Search issues by volume and recency"
    description: "Find top issues by event count and newest emerging errors for a project"
  - label: "Paste issues"
    description: "Provide specific Sentry URLs or IDs to triage"
```

### Option 1: Search Issues

1. **Ask for project** using `AskUserQuestion`:

   ```
   question: "Which Sentry project should I search?"
   header: "Project"
   options:
     - label: "backend-prod (Recommended)"
       description: "Main backend application"
     - label: "frontend-production"
       description: "Frontend web application"
     - label: "worker-service"
       description: "Background worker service"
     - label: "mobile-app"
       description: "Mobile application"
   ```

   (User can select "Other" to specify additional projects.)

2. **Team selection (backend-prod only)**

   The `owner_team_name` tag is only available in the main backend project. Skip this step for all other projects.

   Run the helper script to get available teams:

   ```bash
   ruby .claude/skills/sentry-triage/scripts/list-team-names.rb
   ```

   Then ask using `AskUserQuestion`, building options **entirely from the script output**. Include an option for "All teams" (no filter).

3. **Ask for count** using `AskUserQuestion`:

   ```
   question: "How many issues should I fetch?"
   header: "Count"
   options:
     - label: "20 (Recommended)"
       description: "Good balance for triage session"
     - label: "10"
       description: "Quick review"
     - label: "50"
       description: "Comprehensive review"
     - label: "100"
       description: "Full audit (max)"
   ```

4. **Search Sentry** - Run **two queries** to get both high-volume and newly emerging issues.

   Build the query string based on the selected project:
   - **For the main backend project with a team selected:** `is:unresolved owner_team_name:{team}`
   - **For all other projects (or no team selected):** `is:unresolved`

   Run **exactly 2** `mcp__Sentry__list_issues` calls directly (no sub-agents) in the same message:

   **Query A — Top issues by volume:**
   - organizationSlug: `sentry`
   - regionUrl: `https://sentry.example.com`
   - projectSlugOrId: `{selected project}`
   - query: `{query string from above}`
   - sort: `freq`
   - limit: {count}

   **Query B — Newest issues:**
   - organizationSlug: `sentry`
   - regionUrl: `https://sentry.example.com`
   - projectSlugOrId: `{selected project}`
   - query: `{query string from above}`
   - sort: `new`
   - limit: {count}

5. **Present results in two sections, deduplicated:**
   - **"Top issues by volume"** — from Query A
   - **"Newest issues"** — from Query B

   If an issue appears in both lists, show it only in the volume section and note it's also new.

6. **Let the user select which issues to triage** from either section.

7. **Announce:** "I'm using the sentry-triage skill to triage {N} issues in {project}." (If a team was selected, append "for team {team}".)

8. **Investigate selected issues in parallel** — launch sub-agents (up to 4 at a time) to investigate issues concurrently. See the "Parallel Investigation with Sub-Agents" section for details on what to pass to each sub-agent.

### Option 2: Paste Issues

1. **Collect issues:**

   > Please paste the Sentry issue URLs or IDs (one per line or comma-separated):

2. **Accept formats:**
   - Full URLs: `https://sentry.example.com/organizations/sentry/issues/12345/`
   - Short URLs: `sentry.example.com/issues/12345`
   - Issue IDs: `BACKEND-PROD-XYZ` or just the numeric ID

3. **Announce:** "I'm using the sentry-triage skill to triage {N} provided issues."

4. **Investigate pasted issues in parallel** — launch sub-agents (up to 4 at a time) to investigate issues concurrently. See the "Parallel Investigation with Sub-Agents" section for details on what to pass to each sub-agent.

## Overview

When triaging Sentry errors, follow your team's Goalie Processes guidelines.

- Example: Link to your team's Goalie Responsibility and Process documentation in Confluence/Notion.

## Tools Available

You have access to Sentry MCP tools for investigating issues:

- `mcp__Sentry__list_issues` - List issues with filtering and sorting
- `mcp__Sentry__get_issue_details` - Get details about a specific issue
- `mcp__Sentry__get_issue_tag_values` - Get tag distributions (browser, OS, URL, release, environment)
- `mcp__Sentry__list_events` - List events for analysis
- `mcp__Sentry__analyze_issue_with_seer` - Get AI-powered root cause analysis

You have access to Jira MCP tools for ticket management:

- `mcp_Atlassian_jira_create_issue` - Create a new Jira ticket
- `mcp_Atlassian_jira_update_issue` - Update an existing ticket (only if the user explicitly asks to update a ticket rather than create one)
- `mcp_Atlassian_jira_get_issue` - Get issue details

## Investigation Process

### Parallel Investigation with Sub-Agents

When triaging **multiple issues**, launch sub-agents to investigate issues in parallel (up to 4 at a time). Each sub-agent receives:

- The issue ID and Sentry link
- The full investigation checklist below
- The priority determination criteria
- The triage output template

Each sub-agent should return its complete triage output (see "Triage Output" section). Collect all results, then present them to the user together for review and prioritization.

### Per-Issue Investigation (parallelize these steps within each issue)

When investigating a single Sentry error, run these steps in parallel using sub-agents where possible:

**Batch 1 (run simultaneously):**

- `get_issue_details` — error message, stack trace, culprit, frequency
- `get_issue_tag_values` with `tagKey: 'browser'` — browser distribution
- `get_issue_tag_values` with `tagKey: 'url'` — affected routes/pages
- `get_issue_tag_values` with `tagKey: 'release'` — which releases are affected

**Batch 2 (after Batch 1 provides context):**

- `analyze_issue_with_seer` — AI root cause analysis
- BigQuery queries — affected users/plans count, timeline reconstruction

**From the combined results, determine:**

1. **# of affected users** - How many users are impacted?
2. **# of affected plans** - How many plans are impacted?
3. **# of occurrences** - How frequently is this happening?
4. **Money movement impact** - Does this prevent or affect money movement?
5. **Corrections/Legal risk** - Could this require corrections or have legal risk?

## Priority Determination

| Priority | Jira Priority | Definition                                                                                                                                      | SLA Response         | SLA Resolution   |
| -------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------- |
| **P0**   | Highest       | Emergency Outage. Services down company-wide, critical business function inoperative, massive financial/regulatory risk (>$100k).               | Immediate (0-15 min) | This sprint      |
| **P1**   | High          | Critical Outage. Critical loss of core functionality/security/compliance affecting majority of users. No workarounds. Significant risk (>$50k). | 2 hours              | This sprint      |
| **P2**   | Medium        | Major Degradation. Moderate loss of functionality affecting some users/plans. Limited scope. Moderate risk (>$10k).                             | 1 day                | Next sprint      |
| **P3**   | Low           | Minor Impact. Minor bug impacting few users. Workarounds exist. Minor risk (>$5k over 2 weeks).                                                 | 1 week               | Next month       |
| **P4**   | Lowest        | Noise/Informational. False positive, benign, outdated alert. No user or financial impact.                                                       | 1-6 months           | Snooze or Ignore |

### Critical User Flows (elevate priority when broken)

When an error affects one of these flows, consider elevating its priority by one level:

- **Money in/out flows**: Contributions, distributions, rollovers, loan disbursements/repayments
- **Onboarding flows**: Participant onboarding, plan sponsor onboarding, account setup
- **Plan setup**: Plan creation, plan changes, plan approval/signing
- **Authentication**: Login, MFA, password reset, session management
- **Compliance**: Owner census, compliance corrections, annual testing

## Actions Based on Priority

### P0/P1 - High Priority

- Add to current sprint (link ticket in Sentry)
- Notify team in channel immediately
- Begin taking action immediately
- Determine whether an incident needs to be created
- Escalate to PM and/or Engineering Manager

### P2 - Medium Priority

- Add to current sprint (link ticket in Sentry)
- Refine/discuss in following standup
- Should be next ticket picked up by team

### P3 - Low Priority

- Add to future sprint (link ticket in Sentry)
- Follows standard refinement process

### P4 - Noise/Unknown

- In Sentry, silence the alert:
  - **Until escalating**: For things very likely noise you don't want to see again
  - **60 days**: For errors that might not be noise but seem safe to leave, revisit later

## Triage Output

When triaging a Sentry alert, you MUST gather and document ALL of the following with as much detail as possible.

### Required Information to Gather

1. **Sentry Link**: Direct link to the Sentry issue
2. **Error type and message**: The exception/error being thrown
3. **Timeline Analysis**: Use BigQuery to reconstruct what happened with timestamps
4. **Root Cause**: Detailed explanation of WHY the error occurs (not just what)
5. **Impact Assessment**:
   - Frequency: How often (e.g., "3 occurrences in 6 weeks")
   - User Impact: Direct effect on users (e.g., "None - background job failure")
   - Data Impact: Any data integrity issues (e.g., "Document generated but never linked")
   - Money movement risk: Could this affect contributions, distributions?
   - Legal/compliance risk: Could this require corrections?
6. **Recommended Fix**: Specific code changes with examples when possible
7. **Triage Confidence**: Document overall confidence and breakdown by Impact/Priority and Root Cause (see "Assessing Triage Confidence" section)

### Using BigQuery for Investigation

Use the BigQuery MCP tools to query production data to:

- Reconstruct timeline of events with timestamps
- Determine the actual count of affected users/plans
- Understand the scope and impact of the issue
- Find patterns in when/how the error occurs
- Verify if money movement is affected

## Assessing Triage Confidence

When triaging, always document your confidence level to help the next person understand what's verified versus what needs investigation.

### Confidence Score Guidelines

**Overall Confidence** = weighted average of Impact/Priority and Root Cause confidence

#### Impact/Priority Confidence

**90-100% Confidence:**

- Hard data from Sentry (frequency, affected users/plans)
- Verified in BigQuery
- Clear understanding of user impact
- Money movement risk clearly assessed

**70-89% Confidence:**

- Good Sentry data but not cross-verified
- Impact understood but some edge cases unclear
- Financial risk estimated but not confirmed

**Below 70% Confidence:**

- Limited data or unreliable metrics
- Impact unclear or highly variable
- Need more investigation to understand scope

#### Root Cause Confidence

**90-100% Confidence:**

- Root cause verified by code inspection
- Can reproduce the issue
- Clear understanding of the failure path
- Know exactly why validation/checks fail

**70-89% Confidence:**

- Symptom is clear from error message
- Can see where it fails in code
- Theory about why it happens, but not verified
- Haven't reproduced or tested the scenario

**Below 70% Confidence:**

- Only have error message, no code context
- Multiple possible causes
- Need significant investigation to understand
- Don't know why it's happening

### When to Document Lower Confidence

Lower confidence is perfectly acceptable! Document it honestly so the next person knows:

- What you verified (high confidence)
- What you theorized (medium confidence)
- What you don't know (low confidence)
- What steps would increase confidence

## Creating/Updating Jira Tickets

### Duplicate Check (Required Before Creating)

Before creating a new Jira ticket, **always search for existing tickets** that may already cover the same error. This prevents duplicate tickets from accumulating in the backlog.

**Step 1: Build search queries.** For each triaged issue, extract **multiple** identifying terms from the error. JQL full-text search (`text ~`) tokenizes CamelCase and `::` inconsistently, so always prepare at least two search terms:

- A distinctive phrase from the error message (e.g., `"service end date"`, `"Mutex lock timeout"`)
- The exception type (e.g., `RequestTimeoutException`, `NoMethodError`)
- The Op or class name — but note that CamelCase names often fail with `text ~`, so also try `summary ~` for these

**Step 2: Search Jira.** Run **at least two** JQL searches to maximize recall. Use the `jira-confluence` MCP `searchJiraIssuesUsingJql` tool (more reliable than the Atlassian MCP for project-scoped searches):

**Query A — summary search** (best for Op/class names):

```
jql: "project = {PROJECT} AND summary ~ \"{OpName or error phrase}\" AND statusCategory != Done ORDER BY created DESC"
```

**Query B — full-text search** (catches matches in descriptions):

```
jql: "project = {PROJECT} AND text ~ \"{exception type or error keyword}\" AND statusCategory != Done ORDER BY created DESC"
```

If the issue belongs to a known epic, also search within that epic:

```
jql: "parent = {EPIC-KEY} AND summary ~ \"{error phrase}\" AND statusCategory != Done ORDER BY created DESC"
```

Deduplicate results across queries before presenting to the user.

**Step 3: Present matches.** If potential duplicates are found, present them to the user using `AskUserQuestion`:

```
question: "I found existing tickets that may cover this error. How should I proceed?"
options:
  - label: "Create new ticket"
    description: "None of these match — create a fresh ticket"
  - label: "Skip — already tracked"
    description: "An existing ticket covers this; don't create a new one"
  - label: "Link as duplicate"
    description: "Create the ticket and link it as a duplicate of an existing one"
```

Include the list of potential matches (key, summary, status) in the question text so the user can make an informed decision.

**Step 4: Act on the decision.**

- **Create new ticket**: Proceed with ticket creation as normal.
- **Skip**: Do not create a ticket. Note the existing ticket key in the triage output.
- **Link as duplicate**: Create the ticket, then use `jira_create_issue_link` with link type `Duplicate` to link the new ticket to the existing one.

When no matches are found, proceed directly to ticket creation.

### Ticket Creation

When creating tickets for **multiple triaged issues**, use sub-agents to create/update Jira tickets in parallel (up to 4 at a time). Each sub-agent receives the completed triage output for one issue and creates the ticket using the template below.

The Jira ticket description MUST include a detailed Investigation Summary.

When creating tickets, set these fields:

- **Priority**: Based on the priority determination table (Highest, High, Medium, Low, Lowest)
- **Due date**: Based on SLA (P0/P1: end of current sprint, P2: ~2 weeks, P3: ~30 days)
- **Labels**: Always include `Cursor-Triaged` to mark the ticket as triaged. If overall triage confidence is **90% or higher**, also add the `ai-ready` label.

### Ticket Structure Example

````
## Investigation Summary

### Timeline Analysis ([date])
Based on production BigQuery data for [Model] #[ID]:

[timestamp] - [event description]
[timestamp] - [event description]
[timestamp] - ⚠️ [warning event]
[timestamp] - ❌ ERROR: [error description]

### Root Cause
[Detailed explanation of the issue]:
1. [Step 1 of what happens]
2. [Step 2 of what happens]
3. [Step 3 where things go wrong]
4. [Specific validation/code that causes the failure]

### Impact
- **Frequency**: [e.g., "Very rare (3 occurrences in 6 weeks)"]
- **User Impact**: [e.g., "None (background job failure)"]
- **Data Impact**: [e.g., "Document generated but never linked to configuration"]
- **Money Movement Risk**: [Yes/No - explain]
- **Legal/Compliance Risk**: [Yes/No - explain]

### Recommended Fix
[Description of the fix approach]

[Code example if applicable]:
```ruby
# Example fix
if condition
  object.skip_validation = true
end
````

This follows the existing pattern used in [reference to similar code].

### Triage Confidence

_Overall Confidence: [XX-XX%]_

- _Impact/Priority Assessment_: [XX%] confidence - [Explanation of confidence level and data quality]
- _Root Cause Identification_: [XX%] confidence - [Explanation of what's known vs unknown]

_To increase confidence when working on this:_

- [Action item 1 to verify findings]
- [Action item 2 to reproduce or test]
- [Action item 3 to check for patterns]

### Sentry Link

[link to sentry issue]
