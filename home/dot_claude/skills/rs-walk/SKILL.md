---
name: rs-walk
description: >-
  PR walkthrough — generates a scrollable review document you read instead of the GitHub diff.
  The document IS the review: context from brain, the author's story, curated diff in reading order,
  sticky-rail risks, questions to bring, your notes, and a hidden judgment revealed at the end.
  Submits the review to GitHub as the final step.
  Triggers on: "walk this PR", "review deck", "walk PR", "/rs-walk <url>".
version: 0.3.0
---

# rs-walk — PR walkthrough

Takes a PR URL. Builds a scrollable HTML walkthrough you read instead of the GitHub diff.
No slides. The document is the review surface. GitHub is only for submitting.

Requires: `gh` CLI. Depends on: html-artifact DS (report template + lint binary).
Optional: `qmd` for semantic brain search (falls back to grep).

---

## Step 0 — Preflight

Run the preflight script. It handles all checks and qmd setup in one call:

```bash
SKILL_BIN=~/.claude/skills/rs-walk/bin
PREFLIGHT_OUT=$(bash "${SKILL_BIN}/preflight.sh") || exit 1
# PREFLIGHT_OUT has two lines: "CONTEXT_MODE=qmd|grep" and "ARTIFACT_MODE=json|standalone"
CONTEXT_MODE=$(echo "${PREFLIGHT_OUT}" | grep CONTEXT_MODE | cut -d= -f2)
ARTIFACT_MODE=$(echo "${PREFLIGHT_OUT}" | grep ARTIFACT_MODE | cut -d= -f2)
```

If the script exits non-zero, surface the error message and stop.

`ARTIFACT_MODE=json` means `~/brain/wiki/artifact/artifacts.json` exists — walks get
appended there and show up in html-artifact's unified index for free.
`ARTIFACT_MODE=standalone` means it doesn't — fall back to rs-walk's own
`wiki/walks/index.html`. This is a documented file-format coupling, not a hard
dependency: rs-walk works fully standalone if html-artifact isn't installed.

Set constants used throughout:

```bash
REPORT_TEMPLATE=~/.claude/skills/html-artifact/dist/templates/report.html
LINT_BIN=~/.claude/skills/html-artifact/bin/lint-artifact.mjs
WALKS_DIR=~/brain/wiki/walks
WALKS_INDEX="${WALKS_DIR}/index.html"
ARTIFACTS_JSON=~/brain/wiki/artifact/artifacts.json
```

If `ARTIFACT_MODE=standalone` and `${WALKS_INDEX}` does not exist after preflight,
seed it using the **Index Seeding** procedure at the end of this skill.

---

## Step 1 — Resolve PR URL

Accept:

- Full URL: `https://github.com/org/repo/pull/123`
- Short form: `org/repo#123`

Extract `PR_NUMBER` and `REPO` (`org/repo`).

If no argument provided, ask: "Which PR? (paste the URL)"

---

## Step 2 — Fetch PR data

```bash
bash "${SKILL_BIN}/fetch-pr.sh" "${REPO}" "${PR_NUMBER}"
```

Writes (and prints the paths to) `/tmp/walk-${PR_NUMBER}-meta.json`, `/tmp/walk-${PR_NUMBER}-body.txt`,
`/tmp/walk-${PR_NUMBER}.diff`, `/tmp/walk-${PR_NUMBER}-files.txt`. `body` is fetched in a separate
`gh` call from the rest of the metadata — PR bodies routinely contain control characters (pasted rich
text, emoji, embedded HTML comments) that break `jq` when bundled into one `--json` blob with the
other fields. Never re-combine them into a single call.

If fetch fails, stop with the script's error verbatim.

Store: `PR_META` = contents of the meta.json path, `PR_BODY` = contents of the body.txt path, diff at
`/tmp/walk-${PR_NUMBER}.diff`, files at `/tmp/walk-${PR_NUMBER}-files.txt`.

---

## Step 3 — Context search

Extract key terms: PR title words + top 5 changed file basenames (without extension).

**qmd mode** (`CONTEXT_MODE=qmd`):

```bash
qmd query "{key terms}" --json -c brain -c walks -n 8 2>/dev/null
```

Parse results: for each hit, extract `path`, `score`, `snippet`. Format as:

```
- [{score}%] {path}: {snippet}
```

**grep mode** (`CONTEXT_MODE=grep`):

```bash
grep -rl "{term1}\|{term2}\|{term3}" ~/brain/wiki/ 2>/dev/null | \
  grep -v "walks/index" | head -8
```

Store as `CONTEXT_RESULTS` (text, 10 lines max).

If nothing found in either mode: `CONTEXT_RESULTS="Nothing found in brain for this area — first walk in this territory."`

---

## Step 4 — Parallel agents

Dispatch all four simultaneously. Pass to every agent:

- `PR_META` (full JSON)
- `FILE_LIST` (contents of `/tmp/walk-${PR_NUMBER}-files.txt`)
- First 400 lines of `/tmp/walk-${PR_NUMBER}.diff`

**Supplementary question:** if the user's invocation included something beyond the PR URL (e.g.
"also explain X" or "and what does Y mean here"), dispatch a 5th agent scoped to that question,
reading whatever part of the diff or codebase it needs. This is explanatory, not reviewer-facing —
it goes in its own content section right after "The story" (see Step 5), not folded into Questions
or Risks. Return plain text (not JSON) capped at ~300 words.

### Agent 1 — Story + reading map

**Task:** Tell the story of this PR and decide the reading order.

You are a senior engineer briefing a teammate before they review this PR. Write in the author's voice — what problem forced this change, what they decided, what was hard. No file inventories. No bullet lists of what each file does.

Return a **JSON object** with this schema:

```json
{
  "story": "3 sentences. Causal. Author's voice. What existed, what forced the change, what they decided.",
  "groups": [
    {
      "title": "Short name for this reading stop",
      "framing": "One sentence: why you're reading this now, not what it contains.",
      "files": ["path/to/file.ts"],
      "note": "Optional: the one non-obvious thing to notice in this group. Omit if nothing surprising."
    }
  ]
}
```

Rules:

- 2–5 groups. Group by decision, not by directory.
- Sequence by logical dependency: the group you need to understand before the next makes sense goes first.
- `framing` is WHY, not WHAT. "This is the decision everything else follows from" not "These are the path constants."
- `note` only when genuinely non-obvious. Empty string or omit otherwise.

### Agent 2 — Questions

**Task:** Write 2–3 things the reviewer must confirm while reading the diff. Not abstract — each one has a specific location.

Return a **JSON array**:

```json
[
  {
    "title": "Short label",
    "question": "1–2 sentences. What to verify and why it matters.",
    "pointer": "filename.ts:approximate_line_or_function_name"
  }
]
```

Rules:

- Questions only the reviewer can answer by reading the actual code. No "why did they do X" — the story covers that.
- Each pointer must be a real file from the file list.
- If the PR description mentions something pending QA or unconfirmed, that is always a question.

### Agent 3 — Risk

**Task:** Identify what could break silently or be hard to reverse. One flag per real risk.

Return a **JSON array**:

```json
[
  {
    "title": "Short label",
    "description": "What the risk is.",
    "blast_radius": "What breaks if this assumption is wrong.",
    "file": "filename.ts"
  }
]
```

Rules:

- Unverified assumptions are always risks. Hardcoded strings that must match external systems. Missing tests for edge cases.
- "None identified" only if genuinely true — return `[]`.
- Max 4 flags. Triage ruthlessly.

### Agent 4 — Judgment

**Task:** Honest verdict. This section is hidden from the reviewer until they've written their own notes — your job is to be a calibration check, not a spoiler.

Return a **JSON object**:

```json
{
  "fit": "1–2 sentences. Does this approach solve the right problem? Is the scope correct?",
  "risks_summary": ["bullet 1", "bullet 2"],
  "gaps": ["what's missing or unresolved"],
  "overall": "one word: strong | solid | cautious | concern"
}
```

Do not soften. Do not inflate. "None identified" only if genuinely true.

---

## Step 5 — Assemble walk.html

### Save Step 4's agent outputs to disk

Write each agent's returned JSON to its own file — `build-walk.py` reads them directly:

```bash
# story JSON  → /tmp/walk-${PR_NUMBER}-story.json      {story, groups:[...]}
# questions   → /tmp/walk-${PR_NUMBER}-questions.json   [...]
# risks       → /tmp/walk-${PR_NUMBER}-risks.json       [...]
# judgment    → /tmp/walk-${PR_NUMBER}-judgment.json    {fit, risks_summary, gaps, overall}
```

Build the context JSON from Step 3's results:

```bash
# /tmp/walk-${PR_NUMBER}-context.json
# {"mode": "qmd"|"grep", "items": [...]}
#   qmd items:  [{path, score, snippet}, ...]
#   grep items: ["path", ...]
#   empty items -> script renders the standard "nothing found" fallback verbatim
```

If the user's invocation included a supplementary question alongside the PR URL (e.g. "also explain
X"), dispatch one extra agent scoped to that question (see Step 4 note) and write its answer to
`/tmp/walk-${PR_NUMBER}-extra.json` as `[{"title": "...", "body": "..."}]`. Omit `--extra-sections`
entirely if there's nothing supplementary — don't pass an empty file.

### Check for an existing walk

```bash
SLUG=$(echo "${PR_META}" | jq -r '.title' | tr '[:upper:]' '[:lower:]' | \
  sed 's/[^a-z0-9 ]//g' | tr ' ' '-' | cut -c1-40 | sed 's/-$//')
WALK_DIR=~/brain/wiki/walks/pr-$(echo "${PR_META}" | jq -r '.number')-${SLUG}
```

If `${WALK_DIR}` already exists, ask: "Overwrite existing walk at `${WALK_DIR}`? [y/N]" before
passing `--force` below.

### Build the walk

```bash
WALK_TODAY=$(date +%Y-%m-%d) python3 "${SKILL_BIN}/build-walk.py" \
  --pr-meta /tmp/walk-${PR_NUMBER}-meta.json \
  --diff /tmp/walk-${PR_NUMBER}.diff \
  --story /tmp/walk-${PR_NUMBER}-story.json \
  --questions /tmp/walk-${PR_NUMBER}-questions.json \
  --risks /tmp/walk-${PR_NUMBER}-risks.json \
  --judgment /tmp/walk-${PR_NUMBER}-judgment.json \
  --context /tmp/walk-${PR_NUMBER}-context.json \
  --repo "${REPO}" \
  --tags "{2-3 topic words, comma separated}" \
  [--extra-sections /tmp/walk-${PR_NUMBER}-extra.json] \
  [--force]
```

This does everything that used to be manual in this step: derives the slug, renders each group's
diffs via `render-diff.sh`, fills the report template, injects the sticky rail and toggle JS, strips
template boilerplate (DS showcase nav, hardcoded stats block), opens all links in a new tab, writes
`meta.json` (auto-extracting `PROJ-XXXX`-style ticket IDs from the title and merging them with
`--tags`), and runs the lint binary — printing violations to stderr if any remain. It prints the walk
directory path on success.

The template has 2 pre-existing violations (`inlined-css`, `no-stylesheet`) plus 2 `small-font`
violations in the nav/footer chrome — all at lines before the `<!-- CONTENT -->` insertion point.
These are expected for a self-contained file; the script already warns about this. If the script
reports _other_ violations, something in the agent-supplied JSON produced bad HTML — read the
violation, fix the source JSON or the script, and re-run with `--force`.

If lint passes (or only the 4 template-origin violations remain), open:

```bash
open "${WALK_DIR}/walk.html"
```

---

## Step 6 — Update walks index

Branch on `ARTIFACT_MODE` from Step 0.

**`ARTIFACT_MODE=json`** — append one object to `${ARTIFACTS_JSON}`:

```json
{
  "title": "#{number} — {title}",
  "type": "walk",
  "tier": "wiki",
  "created": "{today}",
  "url": null,
  "file": "../walks/pr-{number}-{slug}/walk.html"
}
```

The `file` path is browser-relative from `/artifacts/index.html`; html-artifact's
server has a separate `/walks/` → `wiki/walks/` static route, so `../walks/...`
resolves correctly. Use `jq` to append:

```bash
jq --arg title "#{number} — {title}" \
   --arg created "{today}" \
   --arg file "../walks/pr-{number}-{slug}/walk.html" \
   '. += [{"title": $title, "type": "walk", "tier": "wiki", "created": $created, "url": null, "file": $file}]' \
   "${ARTIFACTS_JSON}" > "${ARTIFACTS_JSON}.tmp" && mv "${ARTIFACTS_JSON}.tmp" "${ARTIFACTS_JSON}"
```

**`ARTIFACT_MODE=standalone`** — read `~/brain/wiki/walks/index.html`. Find
`<!-- walks: one <tr> per review -->`. Insert before it:

```html
<tr>
  <td style="font-family:var(--mate-font-mono);font-size:14px;">
    <a href="pr-{number}-{slug}/walk.html" style="color:var(--mate-primary);"
      >#{number}</a
    >
  </td>
  <td style="color:var(--mate-frame-text);font-size:14px;">{title}</td>
  <td style="color:var(--mate-frame-muted);font-size:14px;">{author.login}</td>
  <td
    style="font-family:var(--mate-font-mono);font-size:14px;color:var(--mate-frame-muted);"
  >
    {today}
  </td>
  <td>
    {for each tag:
    <span class="badge" style="margin-right:4px;font-size:11px;">{tag}</span>}
  </td>
  <td><span class="badge badge-open">pending</span></td>
</tr>
```

Commit (either mode):

```bash
git -C ~/brain add wiki/walks/ wiki/artifact/artifacts.json 2>/dev/null
git -C ~/brain commit -m "chore: walk pr-{number} {title truncated to 60 chars}"
```

---

## Step 7 — Post-review submission

After the user has read the walk and written their notes, ask:

```
AskUserQuestion:
  "Ready to submit your review?"
  Options: Approve | Request changes | Comment only | Skip for now
```

If **Skip for now**: stop here. Remind: "`gh pr review {number} --repo {REPO} --approve` when ready."

If **Approve**:

```bash
gh pr review ${PR_NUMBER} --repo "${REPO}" --approve
```

If **Request changes** or **Comment only**:

```
AskUserQuestion: "Your review comment?" (free text)
```

Then:

```bash
gh pr review ${PR_NUMBER} --repo "${REPO}" \
  --request-changes --body "{comment}"   # or --comment
```

### After submitting — close the loop

1. Write learning entry `~/brain/wiki/learning/walk-pr-{number}-{slug}.md`:

```markdown
---
title: "Walk: {title}"
type: learning
summary: "{1-sentence: what this PR was and what the key decision was}"
tags: { tags from meta.json }
sources: ["{PR_URL}"]
created: { today }
updated: { today }
---

## What

{story from Agent 1}

## Key decision

{group[0].note or first group framing — the most important thing}

## Risks going in

{risks_summary from Agent 4}

## Verdict

{verdict} — {your_notes if non-empty, else "no notes recorded"}
```

2. Run close-walk script — handles meta.json, index badge, log.md, qmd re-index, commit:

```bash
bash "${SKILL_BIN}/close-walk.sh" "${WALK_DIR}" "${PR_NUMBER}" "{verdict}" "{notes}"
```

3. Stage and commit the learning entry:

```bash
git -C ~/brain add wiki/learning/walk-pr-${PR_NUMBER}-${SLUG}.md
git -C ~/brain commit -m "chore: walk pr-${PR_NUMBER} learning entry"
```

---

## Edge cases

| Situation                    | Behavior                                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| PR body empty                | Infer story from diff; note "No description — inferred from diff" in story section        |
| Diff > 2000 lines            | Cap per-group at 80 lines; add "[diff large — showing key hunks only]" note in each group |
| > 20 changed files           | Agent 1 caps at 5 groups, merges minor files into nearest logical group                   |
| Walk already exists          | Ask: "Overwrite existing walk at `{WALK_DIR}`? [y/N]"                                     |
| Lint fails                   | Surface each violation with file:line. Fix before opening.                                |
| qmd update slow on first run | Print: "Indexing brain — first run, may take ~60s"                                        |
| gh review fails              | Surface error verbatim. meta.json stays with `verdict: null`.                             |
| User skips submission        | meta.json stays with `verdict: null`. Walk stays in index as "pending".                   |

---

## Index Seeding (first-run only, `ARTIFACT_MODE=standalone` only)

Skip this entirely when `ARTIFACT_MODE=json` — html-artifact's own
`wiki/artifact/index.html` already exists and renders `type: "walk"` entries.

When `~/brain/wiki/walks/index.html` does not exist:

1. Read `~/.claude/skills/html-artifact/dist/templates/dashboard.html`
2. Replace `<!-- TITLE -->` (all occurrences) with `PR Walk Index`
3. Replace `<!-- DATE -->` occurrences with today's date
4. Replace the CONTENT comment with the walks table:

```html
<div style="margin-bottom:2rem;">
  <p
    style="color:var(--mate-frame-muted);font-family:var(--mate-font-body);font-size:14px;"
  >
    Every PR walk you run appears here. Open a walk to review inline — GitHub
    only for submitting.
  </p>
</div>
<table class="table w-full" id="walks-table">
  <thead>
    <tr>
      <th
        style="color:var(--mate-frame-muted);font-family:var(--mate-font-body);"
      >
        PR
      </th>
      <th
        style="color:var(--mate-frame-muted);font-family:var(--mate-font-body);"
      >
        Title
      </th>
      <th
        style="color:var(--mate-frame-muted);font-family:var(--mate-font-body);"
      >
        Author
      </th>
      <th
        style="color:var(--mate-frame-muted);font-family:var(--mate-font-body);"
      >
        Date
      </th>
      <th
        style="color:var(--mate-frame-muted);font-family:var(--mate-font-body);"
      >
        Tags
      </th>
      <th
        style="color:var(--mate-frame-muted);font-family:var(--mate-font-body);"
      >
        Verdict
      </th>
    </tr>
  </thead>
  <tbody id="walks-tbody">
    <!-- walks: one <tr> per review, added by rs-walk on each run -->
  </tbody>
</table>
```

5. Write to `~/brain/wiki/walks/index.html`
6. Commit: `git -C ~/brain add wiki/walks/ && git -C ~/brain commit -m "chore: init walks index"`
