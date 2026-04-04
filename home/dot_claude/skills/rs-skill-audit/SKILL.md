---
name: rs-skill-audit
description: Use when reviewing a skill execution transcript to find tool failures, agent struggles, skill gaps, and produce an improvement plan. Use after observing a skill run that had issues, or to audit any skill invocation for quality.
args: "[--skill <skill-name>] [--file <path-to-transcript>]"
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, Agent, AskUserQuestion
---

# Evaluate Skill Execution

## Overview

Analyze a skill execution transcript to identify failures, struggles, and gaps — then produce a prioritized improvement plan. Input is a session transcript (pasted, file, or current context).

**Announce at start:** "I'm using the evaluate-skill skill to analyze this execution and produce an improvement plan."

## Input Sources

Accept the transcript from one of:

1. **Pasted text** — user pastes a transcript directly into the conversation
2. **File path** — `--file <path>` pointing to a saved transcript
3. **Current context** — user says "evaluate the last skill run" or similar; use conversation history

If no transcript is available, ask: "Please paste the skill execution transcript or provide a file path."

## Process

### Step 1: Identify the Skill Under Evaluation

From the transcript, extract:

- **SKILL_NAME** — which skill was invoked (e.g., `/library use`, `/fix-pr`)
- **SKILL_PATH** — locate the skill's SKILL.md on disk:
  ```
  Check: ~/.claude/skills/{SKILL_NAME}/SKILL.md
  Then:  {repo}/skills/{SKILL_NAME}/SKILL.md
  ```
- **INVOCATION** — the exact command/trigger the user used
- **ARGS** — any arguments passed

If `--skill <name>` was provided, use that instead of parsing the transcript.

Read the SKILL.md to understand the intended workflow. This is the baseline you evaluate against.

### Step 2: Build an Execution Timeline

Parse the transcript into an ordered list of actions:

```
[timestamp/order] [actor: agent|user|system] [action type] [detail]
```

Action types:

- `TOOL_CALL` — agent called a tool (Bash, Read, Edit, etc.)
- `TOOL_RESULT` — tool returned output (success, error, permission denied)
- `DECISION` — agent made a choice or branched
- `USER_INPUT` — user provided input or denied a permission
- `SKILL_STEP` — maps to a step in the skill's prescribed workflow
- `DEVIATION` — agent did something not in the skill
- `RECOVERY` — agent handled an error or retried

### Step 3: Analyze Across Dimensions

Evaluate the execution across these 8 dimensions. For each, note specific evidence from the transcript.

#### 3a. Step Compliance

Compare the execution timeline against the skill's prescribed steps.

- Which steps were executed in order?
- Which steps were skipped?
- Which steps were done out of order?
- Were any steps invented that aren't in the skill?

#### 3b. Tool Usage

For every tool call in the transcript:

- Was the correct tool used? (e.g., Read vs cat, Write vs heredoc)
- Did the tool call succeed or fail?
- If failed: was it a permission denial, timeout, bad arguments, or tool bug?
- Were independent tool calls parallelized or run sequentially?
- Were there redundant tool calls (reading the same file twice)?

**Common tool issues to flag:**

- Combining destructive + non-destructive commands in one Bash call (causes full denial on permission reject)
- Using Bash when a dedicated tool exists (cat instead of Read)
- Missing error checking on tool results
- Not retrying after adjusting approach on permission denial

#### 3c. Error Handling & Recovery

For every error or failure in the transcript:

- Did the agent notice the error?
- Did the agent attempt recovery?
- Was the recovery appropriate? (retry same thing vs adjust approach)
- Did unrecovered errors affect the final outcome?
- Did the agent report partial failures honestly?

#### 3d. Agent Struggles

Look for signs the agent was confused or struggled:

- Long pauses / "cogitated" / "brewed" for extended time
- Changed approach mid-stream
- Rationalized away a problem ("this is fine because...")
- Gave up on a step without attempting alternatives
- Claimed success despite visible failures

#### 3e. Efficiency

- Total tool calls: could fewer have achieved the same result?
- Were independent operations parallelized?
- Were there unnecessary reads of files not needed?
- Did the agent do unnecessary exploration before acting?

#### 3f. Output Quality

Compare the agent's final output against what the skill specifies:

- Does it match the expected format/structure?
- Is all required information present?
- Are there inaccuracies or missing pieces?

#### 3g. Skill Gaps

This is the most important dimension — what's **missing from the skill itself** that caused or allowed the issues?

- Are there steps that lack error handling guidance?
- Are there ambiguous instructions the agent interpreted incorrectly?
- Are there missing edge cases the skill doesn't cover?
- Does the skill assume tools/permissions that may not be available?
- Are there implicit steps the skill expects but doesn't document?

#### 3h. Determinism Analysis — Tooling Extraction

Classify every step in the skill's workflow as **deterministic** or **judgment-required**:

**Deterministic** — Same input always produces same action. No agent reasoning needed:

- File operations: clone, copy, move, delete, mkdir
- Command execution: running a linter, a test suite, a build
- Parsing: extracting a field from YAML/JSON, slugifying a string
- Validation: checking if a file exists, verifying a command succeeded
- Template expansion: filling known variables into a fixed structure

**Judgment-required** — Agent reasoning, context, or user interaction needed:

- Interpreting ambiguous input (URL parsing, intent detection)
- Deciding between alternatives based on context
- Error triage: choosing a recovery strategy
- Generating natural language (reports, summaries, explanations)
- Asking the user for clarification

For each skill step, record:

```
| Step | Description | Classification | Extractable? | Notes |
|------|-------------|---------------|-------------|-------|
| 1    | Resolve repo root | deterministic | yes — shell one-liner | Already a bash command in the skill |
| 2    | Clone repo | deterministic | yes — script function | Fixed git clone pattern |
| 3    | Parse URL to find subdir | judgment | partial | Regex covers 90% of GitHub URLs; edge cases need agent |
| 4    | Copy to target | deterministic | yes — cp command | |
| 5    | Verify install | deterministic | yes — ls + test | |
| 6    | Clean up temp dir | deterministic | yes — rm in trap | Should use shell trap for reliability |
| 7    | Report to user | judgment | no | Needs natural language |
```

**Extraction opportunities** — For clusters of deterministic steps, recommend:

1. **Shell function** — When 2+ deterministic steps form a sequence that the skill already expresses as bash commands. The agent calls one function instead of N tool calls.

   ```
   Example: clone → parse path → copy → verify → cleanup
   → extract to: catalog.sh pull-skill <name> <url>
   ```

2. **Validation script** — When deterministic checks are repeated across invocations. The agent calls the script once instead of running each check.

   ```
   Example: check file exists → check SKILL.md present → check frontmatter valid
   → extract to: scripts/validate-skill.sh <path>
   ```

3. **Template/generator** — When deterministic output follows a fixed structure.
   ```
   Example: generate frontmatter → create directory → write boilerplate
   → extract to: scripts/scaffold-skill.sh <name>
   ```

**Why this matters:**

- Deterministic steps done by the agent are fragile (permission issues, command chaining, forgetting cleanup)
- Shell scripts handle errors with `set -e`, traps, and exit codes — more reliable than agent tool calls
- Fewer tool calls = faster execution, fewer permission prompts, less context burned
- Agent focuses on what it's good at: judgment, language, reasoning

**What NOT to extract:**

- Steps that need to adapt based on previous results
- Error recovery that requires reading and interpreting output
- Anything that varies based on user intent or conversation context

### Step 4: Classify Issues

For each issue found, classify:

**Severity:**

- `critical` — execution failed or produced wrong result
- `high` — partial failure, user had to intervene, or cleanup missed
- `medium` — inefficiency or non-ideal behavior, but result was correct
- `low` — cosmetic or minor style issue

**Root cause:**

- `skill-gap` — the skill's instructions are incomplete or ambiguous
- `agent-error` — agent deviated from clear instructions
- `tool-failure` — tool returned an error or unexpected result
- `permission-issue` — user denied a tool call
- `environment` — system/env constraint not anticipated by skill

### Step 5: Generate the Evaluation Report

Present the report in this format:

```markdown
# Skill Evaluation: {SKILL_NAME}

## Execution Summary

- **Skill:** {SKILL_NAME}
- **Invocation:** {exact command}
- **Overall Result:** {success | partial-success | failure}
- **Tool Calls:** {N total, M failed}
- **Steps Completed:** {X of Y prescribed steps}

## Issues Found

### Critical

| #   | Issue | Dimension | Root Cause | Evidence |
| --- | ----- | --------- | ---------- | -------- |
| 1   | ...   | ...       | ...        | ...      |

### High

(same table format)

### Medium / Low

(same table format)

## Execution Timeline

(condensed timeline from Step 2 — only notable events)

## Skill Improvement Recommendations

Priority-ordered list of changes to the SKILL.md:

### 1. {Recommendation title}

**Issue(s) addressed:** #1, #3
**Change:** {specific edit to make to SKILL.md}
**Rationale:** {why this fixes the issue}

### 2. ...

## Determinism Map

| Step | Description | Classification           | Extractable?   |
| ---- | ----------- | ------------------------ | -------------- |
| ...  | ...         | deterministic / judgment | yes/no/partial |

### Extraction Recommendations

#### Extract: {function/script name}

**Steps covered:** {which deterministic steps this replaces}
**Type:** shell function | validation script | template
**Interface:** `{command} <args>`
**Benefit:** Replaces {N} agent tool calls with 1. Adds error handling via set -e/trap.

#### Extract: ...

### Remaining Agent Responsibilities

{List of judgment-required steps that must stay in the skill as agent instructions}

## Agent Behavior Notes

{Observations about agent behavior that aren't skill issues —
e.g., "Agent should have split destructive and non-destructive
commands into separate Bash calls"}
```

### Step 6: Offer to Apply Fixes

After presenting the report, ask:

> "Would you like me to apply the skill improvement recommendations to {SKILL_NAME}/SKILL.md?"

If yes:

1. Read the current SKILL.md
2. Apply each recommendation as an Edit
3. Show the diff summary

If the user wants to apply only some recommendations, let them pick.

## Evaluation Heuristics

Quick-reference patterns that almost always indicate issues:

| Signal in Transcript                                    | Likely Issue                                        |
| ------------------------------------------------------- | --------------------------------------------------- |
| `Permission denied` then same command retried           | Agent didn't adjust approach                        |
| `Permission denied` on combined `&&` command            | Destructive + non-destructive mixed                 |
| `rm -rf` denied                                         | Cleanup step should be separate or optional         |
| Agent says "installed" but cleanup failed               | Partial success reported as full success            |
| `Cogitated for N s` where N > 20                        | Agent struggled with decision                       |
| Tool called then same tool with same args               | Redundant call                                      |
| `cat` / `grep` / `find` in Bash                         | Should use dedicated Read/Grep/Glob tool            |
| File read but never referenced again                    | Unnecessary exploration                             |
| Sequential calls that could be parallel                 | Efficiency issue                                    |
| Agent invents steps not in skill                        | Skill has gaps or agent deviated                    |
| 3+ sequential Bash calls that are all fixed commands    | Deterministic chain — extract to script             |
| Agent copies bash commands verbatim from skill          | Step is deterministic, should be a script           |
| Permission denied on a step that never varies           | Deterministic step — script with proper permissions |
| Agent burned context parsing/validating structured data | Extract to jq/yq/shell — agent shouldn't parse      |

## Error Handling

| Error                                 | Action                                                                        |
| ------------------------------------- | ----------------------------------------------------------------------------- |
| No transcript provided                | Ask user to paste or provide file path                                        |
| Skill SKILL.md not found on disk      | Evaluate without baseline; note in report that compliance couldn't be checked |
| Transcript is truncated               | Evaluate what's available; note gaps                                          |
| Multiple skills invoked in transcript | Ask which one to evaluate, or evaluate each separately                        |

## Notes

- Focus recommendations on **skill gaps** over agent errors — the goal is to improve the skill, not blame the agent.
- Keep the report actionable: every recommendation should be a specific edit to SKILL.md.
- If the same issue pattern appears across multiple evaluations, suggest adding it to the skill's Error Handling table.
- This skill pairs well with the writing-skills testing methodology for validating fixes.
