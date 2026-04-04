---
name: rs-usage
description: Display Claude Code usage statistics including daily activity, token usage, session counts, and cost estimates. Use when asked about usage, stats, tokens, sessions, or Claude Code activity.
allowed-tools: Read, Bash
---

# Claude Code Usage Statistics

Display comprehensive usage statistics for Claude Code sessions.

## Data Source

Stats are stored in `~/.claude/stats-cache.json` and include:

- Daily activity (messages, sessions, tool calls)
- Token usage by model
- Session history
- Usage patterns by hour

## Instructions

1. **Read the stats file:**

   ```
   ~/.claude/stats-cache.json
   ```

2. **Parse and display the data in this format:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  CLAUDE CODE USAGE REPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SUMMARY
• First Session: [date]
• Total Sessions: [count]
• Total Messages: [count]
• Longest Session: [X messages over Y hours]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DAILY ACTIVITY (Last 7 Days)

Date        Messages  Sessions  Tool Calls
──────────  ────────  ────────  ──────────
YYYY-MM-DD       XXX        XX         XXX
YYYY-MM-DD       XXX        XX         XXX
...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TOKEN USAGE

Model: [model name]
• Input Tokens:          X,XXX,XXX
• Output Tokens:           XXX,XXX
• Cache Read Tokens:    XX,XXX,XXX
• Cache Creation:       XX,XXX,XXX
• Total Tokens:         XX,XXX,XXX

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

COST ESTIMATE (by model, see pricing table)

[Model Name]:
  Input:   $X.XX
  Output:  $X.XX
  Cache:   $X.XX (read + write)
[repeat for each model in modelUsage]
─────────────────────────────
Total:   $X.XX

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

USAGE PATTERNS

Peak Hours (sessions started):
[Hour]: [count] sessions  ████████
[Hour]: [count] sessions  ██████
...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

THIS WEEK'S SPENDING

Day         Date        Tokens       Est. Cost
──────────  ──────────  ───────────  ─────────
Monday      YYYY-MM-DD    X,XXX,XXX     $X.XX
...
──────────  ──────────  ───────────  ─────────
TOTAL                    XX,XXX,XXX    $XX.XX

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Cost Calculation

Pricing varies by model. Use the model names from `modelUsage` keys in the stats file and match against this table:

| Model Pattern | Input $/M | Output $/M | Cache Read $/M | Cache Write $/M |
| ------------- | --------- | ---------- | -------------- | --------------- |
| `opus-4-6`    | 15        | 75         | 1.875          | 18.75           |
| `opus-4-5`    | 15        | 75         | 1.875          | 18.75           |
| `sonnet-4-6`  | 3         | 15         | 0.375          | 3.75            |
| `sonnet-4-5`  | 3         | 15         | 0.375          | 3.75            |
| `haiku-4-5`   | 0.80      | 4          | 0.08           | 1.0             |
| `sonnet-3-5`  | 3         | 15         | 0.30           | 3.75            |

Match by checking if the model name contains the pattern. If no match, default to Opus pricing (most conservative estimate).

Formula per model:

```
inputCost = inputTokens * inputRate / 1_000_000
outputCost = outputTokens * outputRate / 1_000_000
cacheReadCost = cacheReadInputTokens * cacheReadRate / 1_000_000
cacheWriteCost = cacheCreationInputTokens * cacheWriteRate / 1_000_000
modelCost = inputCost + outputCost + cacheReadCost + cacheWriteCost
totalCost = sum of all modelCosts
```

## Weekly Cost Calculation

1. **Determine the current week's date range** (Monday to Sunday containing today)
2. **For each model in `modelUsage`**, calculate total cost using the pricing table above
3. **Calculate `costPerToken`**: `totalCost / totalTokensAcrossAllModels`
4. **For each day in the current week**:
   - Sum tokens from `dailyModelTokens` for that date across all models
   - Estimate cost: `dailyCost = dayTokens * costPerToken`
   - If no data for a day, show 0 tokens and $0.00

## Formatting Tips

- Use commas for large numbers (1,234,567)
- Show 2 decimal places for costs
- Create simple bar charts using Unicode blocks for visual patterns
- Sort daily activity by date descending (most recent first)
- Calculate duration from milliseconds to human-readable format
