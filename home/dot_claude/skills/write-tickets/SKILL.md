---
description: Use when writing project tickets, user stories, bug reports, or tech debt items - supports a fast "yeet mode" for single scoped tickets and a full mode that gathers requirements, identifies all tickets needed from input, explores codebase for tech context, and generates structured tickets with confirmation loops
---

**Config:** Read [config.json](config.json) before proceeding.

# Write Tickets

## Overview

Transform inputs into well-structured, technically-refined project tickets. Two modes:

- **Yeet mode:** Fast path for single-ticket creation when the engineer already knows the scope. Minimal gathering, no research or decomposition, one confirmation loop.
- **Full mode:** The complete pipeline for messy or multi-ticket input (meeting notes, Slack threads, rough ideas). Gathers requirements, researches, identifies all tickets, confirms the plan, then writes each ticket with confirmation.

## Process

### Step 0: Choose Mode

If `config.json` has a `default_mode`, use it without asking — just announce: "Using **yeet mode**." (or full mode). The user can override inline (e.g., "use full mode" or "use yeet mode").

If no config or no `default_mode`, ask:

> "Do you want **normal mode** (research + multi-ticket decomposition) or **yeet mode** (fast single ticket)?"

Fallback default: **Normal (full) mode.**

---

## Yeet Mode

The fast path. One ticket, minimal ceremony, same quality guardrails. Does not create epics.

### Yeet Step 1: Gather (Minimal)

Only collect what's needed for a single ticket:

1. **Requirements:** What needs to be built/fixed/cleaned up?
2. **Ticket type:** Infer from content (feature → Story, bug → Bug, cleanup → Task/Improvement). Only ask if ambiguous.
3. **Codebase exploration (default: no):** "Want me to look for entry points?" — only if the user says yes.
4. **Output mode:** If `config.json` has `output_mode` set to `"jira"`, use Jira mode (verify MCP is available; fall back to clipboard if not). If `config.json` has `jira.project` and `jira.component`, use them without asking. Otherwise, same detection as full mode — check for Jira MCP, collect project/component if Jira (see [Jira Reference](#jira-reference)).

**Skip:** Additional context questions, online research questions, epic preference. If the user volunteers extra context, use it — but don't ask.

### Yeet Step 2: Render

Select the appropriate template and read three things:

1. **Template** (structure) — pick by ticket type:
   - Feature / Story → `${CLAUDE_SKILL_DIR}/assets/feature-template.md`
   - Bug → `${CLAUDE_SKILL_DIR}/assets/bug-template.md`
   - Tech Debt → `${CLAUDE_SKILL_DIR}/assets/tech-debt-template.md`
2. **Profile:** `${CLAUDE_SKILL_DIR}/references/profiles/minimal.md` (rendering style — yeet mode default)
3. **Quality rules:** `${CLAUDE_SKILL_DIR}/references/quality-rules.md` (invariants)

The user can override the profile: "use the standard profile" → read `standard.md` instead.

Generate the ticket following the template's structure, the profile's section rules and style guidance, and the quality rules.

### Yeet Step 3: Confirm

Display the rendered ticket and ask: "Does this look good, or do you have feedback?"

**Confirmation loop:** Refine until approved. Do NOT skip this step.

### Yeet Step 4: Create

Same as full mode Step 5, but for a single ticket:

- **Jira API mode:** Create the ticket in Jira using Markdown format. See [Jira Reference](#jira-reference) for API details.
- **Manual mode:** Copy to clipboard via pbcopy. Confirm "Copied to clipboard."

---

## Full Mode

The complete pipeline for multi-ticket or ambiguous input.

### Step 1: Gather Inputs (Upfront)

Ask the user for ALL of the following before generating anything:

1. **Requirements:** What needs to be built/fixed/cleaned up? (Paste description, meeting notes, Slack threads, etc.)
2. **Additional context (optional):** Anything else relevant?
3. **Codebase exploration (default: yes):** Should I search the codebase for relevant patterns, existing code, and implementation hints?
4. **Online research:** Should I search online for established patterns, library configs, or known solutions? (Recommended for bugs/tech debt)
5. **Output mode:** If `config.json` has `output_mode` set to `"jira"`, use Jira mode (verify MCP is available; fall back to clipboard if not). If `config.json` has `jira.project` and `jira.component`, use them without asking. Otherwise, check for Jira MCP → if available, ask Jira vs clipboard. If Jira, collect project and component (see [Jira Reference](#jira-reference)). If clipboard or no MCP, use manual copy/paste mode.
6. **Epic preference:** Ask if they want an epic. Options:
   - New epic if >1 ticket
   - New epic always
   - Existing epic: [key]
   - None

Do NOT proceed until you have at least #1.

**Trust defaults:** If the user skips optional fields or fields with defaults, accept it and move on. Don't ask again — use the default or proceed without that info.

### Step 2: Research (if requested)

Do this BEFORE identifying tickets — research findings often drastically simplify the scope.

**Online research (if requested):**

- Search for established patterns, built-in configurations, or known solutions
- Check library/framework documentation for relevant features
- Look for similar issues and how others solved them

**Codebase exploration (if requested):**

- **Existing functionality:** Does this already exist? Could be duplicate work.
- **Reusable infrastructure:** Utilities, services, configs that handle related concerns
- **Documentation:** READMEs, AGENTS.md, inline docs explaining conventions

**Critical rule:** No assumptions. Only include findings VERIFIED to exist. Research often reveals that a "multi-ticket feature" is actually a "5-line config change."

**Output format:** Use GitHub links to specific files and line numbers when referencing code. Determine the repository URL from the git remote (`git remote get-url origin`), stripping any trailing `.git` suffix and converting SSH URLs to HTTPS format — do not hardcode a repository URL.

### Step 3: Identify Tickets

Analyze the input AND research findings to identify all distinct work items. Consider:

**What makes something a separate ticket?**

- UI work (different skillset, often different reviewer)
- Risky or complex migrations that warrant isolated review/deploy:
  - Skippable or no-op migrations that can be run independently of the application deploy — always separate
  - Column deletes, renames, or type changes — always separate
  - Any migration that could fail or needs manual intervention
- Independent features that don't need each other
- Natural checkpoints where work could be paused and value delivered

**What should stay as ONE ticket?**

- Model + API changes for the same feature (these are tightly coupled)
- Simple migrations bundled with the feature they enable (adding a nullable column, for example)
- Changes so small they'd create overhead as separate tickets
- Work that must be deployed together

For each ticket identified, determine:

- **Title:** Concise description of what the ticket accomplishes
- **Type:** Feature/Story, Bug, or Tech Debt
- **Dependencies:** Which other tickets (if any) must be completed first

### Step 4: Confirm Ticket Plan

Present a simple numbered list showing the tickets in dependency order (prerequisites first). If creating a new epic, show it at the top:

```
Based on your input, I've identified the following tickets:

**Epic: Enable feature X for users**
1. Add migration for new columns
2. Add model validations and API endpoint
3. Add UI components for new feature

Does this breakdown and order look right?
```

If linking to an existing epic, mention it:

```
Based on your input, I've identified the following tickets (will be linked to PROJ-1234):

1. Add migration for new columns
2. Add model validations and API endpoint

Does this breakdown and order look right?
```

**Confirmation loop:**

1. Present the list (with epic if applicable)
2. Ask: "Does this breakdown and order look right?"
3. If feedback: adjust and show again (add/remove/merge/split/reorder)
4. Repeat until approved

Do NOT proceed to writing tickets until the plan is approved.

### Step 5: Write Tickets

**Issue type mapping:** When creating tickets via JIRA API, map ticket types to JIRA issue types:

- Feature/Story → "Story" (or "Improvement" if enhancing existing functionality)
- Bug → "Bug"
- Tech Debt → "Task" or "Improvement"

For each ticket, read three things before writing:

1. **Template** (structure) — pick by ticket type:
   - Feature / Story → `${CLAUDE_SKILL_DIR}/assets/feature-template.md`
   - Bug → `${CLAUDE_SKILL_DIR}/assets/bug-template.md`
   - Tech Debt → `${CLAUDE_SKILL_DIR}/assets/tech-debt-template.md`
   - Epic → `${CLAUDE_SKILL_DIR}/assets/epic-template.md`
2. **Profile:** `${CLAUDE_SKILL_DIR}/references/profiles/standard.md` (rendering style — full mode default)
3. **Quality rules:** `${CLAUDE_SKILL_DIR}/references/quality-rules.md` (invariants)

The user can override the profile: "use the minimal profile" → read `minimal.md` instead.

The workflow differs based on output mode:

#### Jira API Mode

Write, approve, and create each ticket before moving to the next:

1. Maintain a mapping of placeholder → JIRA key (e.g., "Ticket #1" → "PROJ-1115")
2. **If creating a new epic:**
   - Generate the epic using the epic template
   - Display it to the user and get approval (same feedback loop as tickets)
   - When approved: Prompt for T-Shirt Size Estimate (see [Jira Reference](#jira-reference))
   - Create the epic in Jira
   - Store the epic key in the mapping as "Epic" → "PROJ-1234"
   - Confirm: "Created epic PROJ-1234"
3. For each ticket in the approved plan:
   - Generate the ticket using template + profile + quality rules
   - Replace any placeholder references with actual JIRA keys from the mapping
   - Display it to the user
   - Ask: "Does this look good, or do you have feedback?"
   - If feedback: refine and show again
   - When approved: Create the ticket in Jira using Markdown format
     - **If epic exists (new or existing):** Set the `parent` field to the epic key
   - Add the new JIRA key to the mapping
   - Confirm: "Created PROJ-1115 (Ticket 1 of 3)"
4. After all tickets: Confirm "All [N] tickets created!" with the list of keys (and epic if applicable)

#### Manual Copy/Paste Mode

Write, approve, and copy each ticket before moving to the next:

1. **If creating a new epic:**
   - Generate the epic using the epic template
   - Display it to the user and get approval
   - When approved: Copy the epic to clipboard using pbcopy
   - Confirm: "Epic copied to clipboard. Paste it into JIRA as an Epic, then tell me the epic key (e.g., PROJ-1234)"
   - Wait for user to provide the epic key before proceeding
2. For each ticket in the approved plan:
   - Generate the ticket using template + profile + quality rules
   - Display it to the user
   - Ask: "Does this look good, or do you have feedback?"
   - If feedback: refine and show again
   - When approved: Copy this ticket to clipboard using pbcopy
   - Confirm: "Ticket N of M copied to clipboard. Paste it into JIRA, then say 'continue' for the next ticket."
     - **If epic exists:** Remind user: "Don't forget to set the parent to [epic key]"
   - Wait for user to say continue before proceeding
3. After all tickets: Confirm "All [N] tickets complete!"

---

## Jira Reference

### MCP Discovery

When output mode is Jira:

1. Try calling the JIRA user info tool to confirm MCP is available
2. Get cloudId from `getAccessibleAtlassianResources`
3. If `config.json` has `jira.project` and `jira.component`, use them. Otherwise, ask: "Which project and component? (e.g., PROJ / Gen Tech)" — users can provide both upfront
4. Get issue types from `getJiraProjectIssueTypesMetadata` (needs cloudId, projectIdOrKey)
5. If component not provided (and not in config), get components from `getJiraIssueTypeMetaWithFields` (needs cloudId, projectIdOrKey, issueTypeId) — present as a numbered list
6. Store project, component, cloudId, and issueTypeId for later use

### API Gotchas

- Use `issueTypeName` (not `issueType`) when calling `createJiraIssue`
- Components cannot be set during creation — two-step process:
  1. Create the ticket with `createJiraIssue`
  2. Add component with `editJiraIssue` using: `{"fields": {"components": [{"id": "COMPONENT_ID"}]}}`
- Component IDs are in the `allowedValues` for the `components` field from `getJiraIssueTypeMetaWithFields`
- **T-Shirt Size Estimate is required for Epics.** Prompt the user and pass via `additional_fields`: `{"customfield_13485": {"value": "Medium"}}`. Allowed values: X-Small, Small, Medium, Large, X-Large.
- Use "Epic" issue type — fetch dynamically via `getJiraProjectIssueTypesMetadata`
- Always use Markdown format when creating tickets

---

## Common Mistakes

| Mistake                                               | Fix                                                                         |
| ----------------------------------------------------- | --------------------------------------------------------------------------- |
| Diving into ticket generation before gathering inputs | Always gather inputs first. Do not proceed without requirements.            |
| Proposing tickets before researching                  | Research first — a "multi-ticket feature" is often a "5-line config change" |
| Writing tickets without confirming the plan first     | Always get approval on the ticket list/order before writing any tickets.    |
| Skipping confirmation loop                            | Always ask if ticket looks good before finalizing — both modes.             |
| Wrong ticket boundaries                               | Model + API = one ticket; UI = separate; risky migrations = separate.       |
| Using yeet mode for multi-ticket input                | If input contains multiple items or needs decomposition, use full mode.     |
