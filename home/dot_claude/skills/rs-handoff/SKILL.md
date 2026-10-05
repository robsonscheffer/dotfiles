---
name: rs-handoff
description: Compact the current conversation into a handoff document for another agent to pick up, or pick up an open one.
argument-hint: "[pickup [project]] | what the next session will be used for"
disable-model-invocation: true
---

Handoffs live in the brain vault, whatever repo this session is in. The layout and schema below
mirror the **Handoffs** section of `~/brain/AGENTS.md`; if they ever disagree, that file wins.

```text
~/brain/.scratch/handoffs/<project>/YYYY-MM-DD-<slug>.md
```

- `<project>`: the git repo's directory name (`dotfiles`, `myapp`). When the session
  is in `~/brain` itself, use the area the work is about (a product or a team), never
  `brain`. Outside any repo with no clear area: `general`. Lowercase kebab-case.
- `<slug>`: short kebab-case topic, e.g. `live-agent-trace`.
- Never `/tmp` or any OS temp dir; they're cleared.

## Mode 1: pickup (`/rs-handoff pickup [project]`)

1. Project defaults to the current one (rule above).
2. List every `status: open` handoff in `~/brain/.scratch/handoffs/<project>/`, newest first,
   one line each: date, slug, `next`. If none, say so and list the other project folders that
   have open ones.
3. When the user picks one, read it in full, set `status: picked-up` and add
   `picked_up: YYYY-MM-DD`, then retire it:
   `attic put <path> "picked up"`. It stays readable in `~/.attic/`
   for 30 days.
4. Continue the work from its `next` line.

## Mode 2: write (anything else)

Summarise the conversation so a fresh agent can continue. If the user passed arguments, treat
them as what the next session will focus on and tailor the doc to that.

Start the file with this frontmatter:

```yaml
---
project: myapp
topic: live-agent-trace
created: 2026-09-25
status: open                  # open | picked-up
repo: ~/apps/acme/myapp       # omit outside a repo
branch: feat/PROJ-123-live-agent-trace  # omit outside a repo
next: "Rebase onto main, then re-run the trace test"
---
```

`next` is one line: the first concrete action. It is what pickup shows, so make it enough to
choose by.

Body:

- Goal, current state, what's done, what's left, decisions made and why.
- A "Suggested skills" section naming skills the next agent should invoke.
- Reference existing artifacts (specs, plans, ADRs, issues, commits, diffs, PRs) by path or URL
  instead of copying them.
- Redact secrets, tokens, passwords, and personal data.

Anything durable (a decision, a fact about infra) belongs in `~/brain/wiki/` or a card, not only
in a handoff. Say so in the handoff if you found something that should be promoted.

## Stale sweep (every write)

After writing, move every `status: open` handoff in the same project folder whose filename date
is more than 14 days old to the attic:

```bash
attic put <path> "stale open handoff (>14 days)"
```

Report what you moved. The attic sweeps files untouched for 30 days, so a forgotten handoff can
still be recovered for a while.
