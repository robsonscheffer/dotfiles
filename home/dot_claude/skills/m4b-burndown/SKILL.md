---
name: m4b-burndown
description: Run one cycle of the M4B web analytics burndown. Reads state, picks the next eligible ticket, dispatches the pipeline, handles the result, updates state. Stops after one ticket. Robson owns the merge. Use when Robson says "run m4b burndown", "next m4b", "m4b next cycle", or invokes /m4b-burndown.
---

# Burndown — one cycle

Generic queue runner. Reads a ticket queue, picks the next action, dispatches a pipeline,
handles the result, captures a learning. Stops after one ticket.

## Configuration (M4B queue)

```
harness:   ~/brain/projects/retirement/m4b-burndown/
pipeline:  ~/.mate/pipelines/m4b-implement/m4b-implement.tasks.yml
repo:      ~/workspace/web
pr_label:  m4b-o11y
```

---

## Step 1 — Read state

Read `state.json` from the harness. Scan all `lane: build` tickets.

---

## Step 2 — Pick one ticket to act on

Evaluate each ticket independently. Act on the highest-priority match:

| Priority | Status                  | Condition                        | Action                  |
| -------- | ----------------------- | -------------------------------- | ----------------------- |
| 1        | `merged`                | —                                | **ADVANCE**             |
| 2        | `pr-open` / `in-review` | actionable review comments exist | **ITERATE**             |
| 3        | `building`              | —                                | **RECOVER** (see below) |
| 4        | `queued`                | deps met                         | **BUILD**               |

If nothing matches → report current state to Robson and stop.

---

## Step 3 — Act

### BUILD (queued → building)

**Pre-dispatch branch check — always, before every pipeline dispatch:**

```sh
git -C <repo> fetch origin <branch> --quiet 2>/dev/null
AHEAD=$(git -C <repo> log origin/main..origin/<branch> --oneline 2>/dev/null | wc -l | tr -d ' ')
```

- `AHEAD > 0` → branch already has commits. Skip the pipeline. Go to **OPEN PR** below.
- `AHEAD == 0` → safe to dispatch.

Set ticket `status: building` in state.json. Commit harness dir. Then dispatch:

```sh
mate pipeline run <pipeline> \
  --set ticket_id=<id> \
  --set branch=<ticket.branch> \
  --set harness_dir=<harness> \
  --wait
```

Pipeline success → state.json already updated by pipeline's board step → go to **CAPTURE LEARNING**.  
Pipeline failure → go to **RECOVER**.

### RECOVER (building with no pr_url)

Check whether the pipeline pushed commits before failing:

```sh
git -C <repo> fetch origin <branch> --quiet 2>/dev/null
AHEAD=$(git -C <repo> log origin/main..origin/<branch> --oneline 2>/dev/null | wc -l | tr -d ' ')
```

- `AHEAD > 0` → pipeline pushed commits but failed at PR step. Go to **OPEN PR**.
- `AHEAD == 0` → implement made no commits. Read `~/.mate/run/m4b-findings-<ticket_id>.md` for clues.
  Surface the failure and findings to Robson. Update state.json notes. Go to **CAPTURE LEARNING**.
  **Do not re-dispatch** — re-dispatch resets the branch.

### OPEN PR (manual fallback)

Write body to a temp file, then:

```sh
gh -R <pr_repo> pr create \
  --draft --base main --head <branch> \
  --title "[<ticket_id>] <description>" \
  --body-file <tmpfile> \
  --label <pr_label>
```

Update state.json: `status: pr-open`, `pr_url: <url>`. Go to **CAPTURE LEARNING**.

### ITERATE (pr-open/in-review with review comments)

Dispatch the pipeline in fix-only mode:

```sh
mate pipeline run <pipeline> \
  --set ticket_id=<id> \
  --set branch=<ticket.branch> \
  --set harness_dir=<harness> \
  --set mode=fix \
  --wait
```

### ADVANCE (merged)

Confirm merge via `gh pr view <pr_url> --json state`. Set `status: merged`. Update state.json.

---

## Step 4 — Capture learning

After every outcome — success, failure, or manual recovery — append one entry to `learnings.md`:

```
## <date> — <ticket_id> — <outcome: built | failed | recovered | iterated>

- <what happened>
- <what worked or what broke, with file:line if relevant>
- <one rule the next cycle should not re-derive>
```

Newest entry on top.

---

## Step 5 — Commit harness dir

```sh
python3 <harness>/render_state.py
git -C ~/brain add projects/retirement/m4b-burndown/ wiki/artifact/dashboard/
git -C ~/brain commit -m "chore(m4b): <ticket_id> <status>"
```

---

## Guardrails

- **Never merge.** Robson owns the GitHub merge queue.
- **Never re-dispatch without a branch check.** Re-dispatch resets the branch and destroys pushed commits.
- **Never post to GitHub without confirming.** PR creation is the exception — it's part of the pipeline or manual OPEN PR step above.
- **One ticket per cycle.** Stop after acting on one ticket.
