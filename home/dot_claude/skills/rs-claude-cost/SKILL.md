---
name: rs-claude-cost
description: Weekly Claude Code cost report from local transcripts. A terminal summary, a JSON report, and a self-contained HTML page, centered on context and cache cost, with dollar-sized findings compared week to week. Run with /rs-claude-cost.
argument-hint: "[--week YYYY-Www] [--tz UTC] [session <id>]"
disable-model-invocation: true
allowed-tools:
  - Bash
  - Read
---

# rs-claude-cost

Deterministic. No step calls a model. The numbers come from the code, so relay them; never
compute, round, or restate them yourself.

## Run

1. Run the command, passing through any arguments the user gave:

   ```
   ~/.claude/skills/rs-claude-cost/bin/rs-claude-cost --open $ARGUMENTS
   ```

   With no `--week` it reports the last completed Monday-to-Sunday week, local time.

2. Paste the terminal summary exactly as printed, in a code block. Do not summarize it.
3. The page opens on its own (`--open`). If it did not, say so and give the `page:` path from the
   last line.
4. On exit code 2, name the warning from the banner (unknown model, stale prices, unreadable
   files). On exit 1, totals failed to reconcile and nothing was written: report that and stop.

## Follow-up questions

Answer from the JSON report, never from memory:

```
jq '.findings' ~/.local/state/rs-claude-cost/weeks/<YYYY-Www>.json
```

Top-level keys: `window`, `pricing`, `totals`, `by_kind`, `by_model`, `by_thread`, `context`,
`cache`, `overhead`, `sessions`, `findings`, `whatif`, `since_last_week`, `data_quality`. Money
is integer micro-dollars (divide by 1,000,000).

To look inside one session turn by turn:

```
~/.claude/skills/rs-claude-cost/bin/rs-claude-cost session <session-id>
```

## What it cannot know

- **Contract prices.** Every figure is list price. Real spend can be much lower.
- **Anything outside local transcripts.** Other machines, cloud sessions, and other tools.
- **Cache-break causes are inferred** from timestamps and are labeled "likely".
- **Estimated findings are approximations.** Say "estimated" when you mention one.

Reports hold paths, branches, and session ids. They stay in `~/.local/state/rs-claude-cost/`.
Do not paste them anywhere outside this machine.
