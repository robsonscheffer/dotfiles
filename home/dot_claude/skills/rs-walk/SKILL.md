---
name: rs-walk
description: >-
  PR walkthrough — generates a scrollable review document you read instead of the GitHub diff.
  The document IS the review: context from brain, the author's story, curated diff in reading order,
  inline risk flags, questions to bring, your notes, and a hidden judgment revealed at the end.
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

### 1. gh CLI

```bash
gh auth status 2>/dev/null && echo "OK" || echo "FAIL"
```

If FAIL — stop: "`gh` CLI required. Run `gh auth login`."

### 2. html-artifact DS

```bash
REPORT_TEMPLATE=~/.claude/skills/html-artifact/dist/templates/report.html
LINT_BIN=~/.claude/skills/html-artifact/bin/lint-artifact.mjs
[ -f "${REPORT_TEMPLATE}" ] && echo "TEMPLATE_OK" || echo "TEMPLATE_MISSING"
[ -f "${LINT_BIN}" ] && echo "LINT_OK" || echo "LINT_MISSING"
```

If either missing — stop: "html-artifact plugin required. Check `~/.claude/skills/html-artifact/`."

### 3. wiki/walks/ — first-run setup

```bash
WALKS_DIR=~/brain/wiki/walks
WALKS_INDEX=${WALKS_DIR}/index.html

if [ ! -d "${WALKS_DIR}" ]; then
  mkdir -p "${WALKS_DIR}"
  # Seed index.html — see Index Seeding section below
fi
```

If `${WALKS_INDEX}` does not exist, create it using the **Index Seeding** procedure at the end of this skill.

### 4. qmd — optional, self-healing

```bash
if command -v qmd &>/dev/null; then
  # Brain collection
  if ! qmd collection list --json 2>/dev/null | jq -e '.[] | select(.name=="brain")' >/dev/null 2>&1; then
    echo "Adding brain collection..."
    qmd collection add ~/brain/wiki brain
    qmd update brain
  fi
  # Walks collection
  if ! qmd collection list --json 2>/dev/null | jq -e '.[] | select(.name=="walks")' >/dev/null 2>&1; then
    echo "Adding walks collection..."
    qmd collection add ~/brain/wiki/walks walks
    qmd update walks 2>/dev/null || true  # empty on first run, ok
  fi
  CONTEXT_MODE=qmd
else
  CONTEXT_MODE=grep
fi
```

Store `CONTEXT_MODE`. Never block on qmd absence.

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
PR_META=$(gh pr view ${PR_NUMBER} --repo "${REPO}" \
  --json "number,title,body,author,headRefName,baseRefName,additions,deletions,changedFiles,url,commits")

# Full diff — no truncation, saved to scratchpad
gh pr diff ${PR_NUMBER} --repo "${REPO}" > /tmp/walk-${PR_NUMBER}.diff

# File list only (for agents)
gh pr diff ${PR_NUMBER} --repo "${REPO}" --name-only > /tmp/walk-${PR_NUMBER}-files.txt
```

If fetch fails, stop with gh error verbatim.

Store: `PR_META` (JSON), diff at `/tmp/walk-${PR_NUMBER}.diff`, files at `/tmp/walk-${PR_NUMBER}-files.txt`.

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

### Derive path

```bash
SLUG=$(echo "${PR_META}" | jq -r '.title' | tr '[:upper:]' '[:lower:]' | \
  sed 's/[^a-z0-9 ]//g' | tr ' ' '-' | cut -c1-40 | sed 's/-$//')
WALK_DIR=~/brain/wiki/walks/pr-$(echo "${PR_META}" | jq -r '.number')-${SLUG}
mkdir -p "${WALK_DIR}"
WALK_HTML="${WALK_DIR}/walk.html"
META_JSON="${WALK_DIR}/meta.json"
```

If `${WALK_DIR}` already exists, ask: "Overwrite existing walk at `${WALK_DIR}`? [y/N]"

### Parse diff per group

For each group from Agent 1, extract the diff for its files from `/tmp/walk-${PR_NUMBER}.diff`.

Use `awk` to extract per-file diff sections:

```bash
# Extract diff for one file (e.g. "src/embeds/embeddedPaths.ts")
FILE="src/embeds/embeddedPaths.ts"
awk "/^diff --git.*${FILE//\//\\/}/,/^diff --git [^$]/" /tmp/walk-${PR_NUMBER}.diff | \
  grep -v "^diff --git" | head -80
```

Render each diff section as `.diff-block` HTML. For each line of the extracted diff:

- Lines starting with `+` (not `+++`): `<div class="diff-line added">{html-escaped line}</div>`
- Lines starting with `-` (not `---`): `<div class="diff-line removed">{html-escaped line}</div>`
- Lines starting with `@@`: `<div class="diff-hunk-header">{html-escaped line}</div>`
- Lines starting with `diff --git`, `index`, `---`, `+++`: skip
- All other lines: `<div class="diff-line context">{html-escaped line}</div>`

HTML-escape all line content: `<` → `&lt;`, `>` → `&gt;`, `&` → `&amp;`.

If a group has a risk flag from Agent 3 matching one of its files, render the risk callout immediately before the diff block.

**Cap per group: 80 diff lines.** If a file has more, show the first 60 + a note: `<div class="diff-line context" style="color:var(--mate-frame-muted);">[… {N} more lines — open file in GitHub]</div>`

### Build the HTML document

Read `${REPORT_TEMPLATE}`. Fill the slots:

**`<!-- TITLE -->`** (all 3 occurrences):

```
Walk: #{number} · {title}
```

**`<!-- DATE -->`** (both occurrences): today's date `YYYY-MM-DD`

**`<!-- ADDITIONAL META BADGES -->`**:

```html
<span class="badge badge-building">{headRefName}</span>
<span
  class="badge"
  style="background:var(--mate-frame-sidebar);color:var(--mate-frame-muted);"
  >{CONTEXT_MODE}</span
>
```

**`<!-- FOOTER LINK -->`**:

```html
<a href="{PR_URL}" style="color:var(--mate-primary);"
  >Open PR #{number} on GitHub ↗</a
>
```

**`<!-- CONTENT -->`**: replace with the full walkthrough body below.

### Walkthrough content structure

```html
<div class="spec-layout">
  <aside class="spec-rail">
    <div class="spec-rail-row">
      <span class="spec-rail-label">AUTHOR</span>
      <span class="spec-rail-value">{author.login}</span>
    </div>
    <div class="spec-rail-row">
      <span class="spec-rail-label">PR</span>
      <span class="spec-rail-value">
        <a href="{url}" style="color:var(--mate-primary);">#{number}</a>
      </span>
    </div>
    <div class="spec-rail-row">
      <span class="spec-rail-label">REPO</span>
      <span class="spec-rail-value" style="font-family:var(--mate-font-mono);font-size:12px;">{REPO}</span>
    </div>
    <div class="spec-rail-row">
      <span class="spec-rail-label">CHANGES</span>
      <span class="spec-rail-value" style="font-family:var(--mate-font-mono);">
        <span style="color:var(--mate-success);">+{additions}</span>
        <span style="color:var(--mate-error);">−{deletions}</span>
        · {changedFiles} files
      </span>
    </div>
    <div class="spec-rail-row">
      <span class="spec-rail-label">BRANCH</span>
      <span class="spec-rail-value" style="font-family:var(--mate-font-mono);font-size:11px;">{headRefName}</span>
    </div>
    <div class="spec-rail-row">
      <span class="spec-rail-label">CONTEXT</span>
      <span class="spec-rail-value">{CONTEXT_MODE}</span>
    </div>
  </aside>

  <div>

    <!-- CONTEXT SECTION -->
    <section style="margin-bottom:2rem;">
      <h2 style="font-family:var(--mate-font-display);font-size:1.1rem;color:var(--mate-frame-muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.75rem;">Context</h2>
      <!-- If CONTEXT_RESULTS has entries, render as a list -->
      <!-- If nothing found, render the "first walk" message in muted text -->
      {CONTEXT_RESULTS rendered as <ul> or <p style="color:var(--mate-frame-muted);">}
    </section>

    <!-- STORY SECTION -->
    <section style="margin-bottom:2.5rem;">
      <h2 style="font-family:var(--mate-font-display);font-size:1.1rem;color:var(--mate-frame-muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.75rem;">The story</h2>
      <p style="font-size:15px;line-height:1.7;color:var(--mate-frame-text);">{story}</p>
    </section>

    <!-- DIFF SECTIONS — one per group from Agent 1 -->
    {for each group:}
    <section style="margin-bottom:2.5rem;">
      <h2 style="font-family:var(--mate-font-display);font-size:1.25rem;margin-bottom:0.25rem;">{group.title}</h2>
      <p style="font-size:13px;color:var(--mate-frame-muted);margin-bottom:1rem;">{group.framing}</p>

      {if group.note:}
      <div class="spec-decision" style="margin-bottom:1rem;">
        {group.note}
      </div>

      {if risk flag matches this group's file:}
      <div class="alert" style="background:rgba(232,184,74,0.08);border-left:3px solid var(--mate-warning);padding:0.75rem 1rem;margin-bottom:1rem;border-radius:4px;">
        <strong style="color:var(--mate-warning);">⚠ {risk.title}</strong>
        <p style="margin:0.25rem 0 0;font-size:13px;">{risk.description}</p>
        <p style="margin:0.25rem 0 0;font-size:12px;color:var(--mate-frame-muted);">Blast radius: {risk.blast_radius}</p>
      </div>

      <!-- Diff block for each file in this group -->
      {for each file in group.files:}
      <div class="diff-block">
        <div class="diff-file-header">{file}</div>
        {rendered diff lines}
      </div>
    </section>

    <!-- QUESTIONS -->
    <section style="margin-bottom:2.5rem;">
      <h2 style="font-family:var(--mate-font-display);font-size:1.1rem;color:var(--mate-frame-muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:1rem;">Bring your questions</h2>
      {for each question:}
      <div class="spec-decision" style="margin-bottom:1rem;">
        <strong style="font-size:14px;">{question.title}</strong>
        <p style="margin:0.5rem 0;font-size:14px;">{question.question}</p>
        <code style="font-family:var(--mate-font-mono);font-size:12px;color:var(--mate-frame-muted);">{question.pointer}</code>
      </div>
    </section>

    <!-- YOUR NOTES -->
    <section style="margin-bottom:2.5rem;border-top:1px solid rgba(255,255,255,0.06);padding-top:2rem;">
      <h2 style="font-family:var(--mate-font-display);font-size:1.1rem;color:var(--mate-frame-muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.75rem;">Your notes</h2>
      <p style="color:var(--mate-frame-dim);font-size:13px;font-style:italic;">Fill in as you read. What you caught, what you approved, what surprised you.</p>
      <div style="margin-top:0.75rem;min-height:4rem;border-bottom:1px solid rgba(255,255,255,0.08);"></div>
    </section>

    <!-- JUDGMENT — hidden until revealed -->
    <details style="margin-bottom:2rem;">
      <summary style="cursor:pointer;font-family:var(--mate-font-body);font-size:13px;color:var(--mate-frame-dim);padding:0.5rem 0;user-select:none;">
        ▸ Reveal judgment — read your notes first
      </summary>
      <div style="margin-top:1.5rem;padding:1.5rem;background:rgba(255,255,255,0.02);border-radius:6px;border:1px solid rgba(255,255,255,0.06);">
        <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1.25rem;">
          <span style="font-family:var(--mate-font-display);font-size:1.1rem;color:var(--mate-frame-muted);text-transform:uppercase;letter-spacing:0.08em;">Judgment</span>
          <span class="badge {badge-class-by-overall}">{overall}</span>
        </div>
        <p style="font-size:14px;margin-bottom:1rem;"><strong>Fit:</strong> {fit}</p>
        {if gaps non-empty:}
        <div style="margin-bottom:1rem;">
          <strong style="font-size:13px;color:var(--mate-frame-muted);">Gaps</strong>
          <ul style="margin-top:0.5rem;font-size:13px;">
            {for each gap: <li>{gap}</li>}
          </ul>
        </div>
      </div>
    </details>

  </div>
</div>
```

Badge class by overall:

- `strong` → `badge-done`
- `solid` → `badge-building`
- `cautious` → `badge-open` with warning color
- `concern` → `badge-open` with error color (use inline style)

### Write meta.json

```json
{
  "pr": {number},
  "url": "{PR_URL}",
  "title": "{title}",
  "author": "{author.login}",
  "repo": "{REPO}",
  "date": "{today}",
  "tags": [],
  "context_mode": "{CONTEXT_MODE}",
  "verdict": null,
  "your_notes": "",
  "judgment_overall": "{overall}",
  "judgment_risks": [{risks_summary}],
  "delta": ""
}
```

Tags: extract from PR title — any ticket IDs (RETIRE-XXXX), repo slug, and 2–3 topic words.

### Lint

```bash
node "${LINT_BIN}" "${WALK_HTML}"
```

Fix every violation before continuing. If lint passes, open:

```bash
open "${WALK_HTML}"
```

---

## Step 6 — Update walks index

Read `~/brain/wiki/walks/index.html`. Find `<!-- walks: one <tr> per review -->`. Insert before it:

```html
<tr>
  <td style="font-family:var(--mate-font-mono);font-size:13px;">
    <a href="pr-{number}-{slug}/walk.html" style="color:var(--mate-primary);"
      >#{number}</a
    >
  </td>
  <td style="color:var(--mate-frame-text);font-size:14px;">{title}</td>
  <td style="color:var(--mate-frame-muted);font-size:13px;">{author.login}</td>
  <td
    style="font-family:var(--mate-font-mono);font-size:12px;color:var(--mate-frame-muted);"
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

Commit:

```bash
git -C ~/brain add wiki/walks/
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

1. Update `meta.json`: set `verdict` to `approved` / `changes-requested` / `commented`.

2. Write learning entry `~/brain/wiki/learning/walk-pr-{number}-{slug}.md`:

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

{group[0].note or framing — the most important thing}

## Risks going in

{risks_summary from Agent 4}

## Verdict

{verdict} — {your_notes if non-empty, else "no notes recorded"}
```

3. Append to `~/brain/wiki/log.md`:

```
## [{today}] walk | {PR_URL} | {verdict}
```

4. Update the verdict badge in `walks/index.html` — find the row for this PR and replace `badge-open">pending` with the appropriate badge.

5. Re-index walks:

```bash
[ "${CONTEXT_MODE}" = "qmd" ] && qmd update walks 2>/dev/null || true
```

6. Commit:

```bash
git -C ~/brain add wiki/walks/ wiki/learning/ wiki/log.md
git -C ~/brain commit -m "chore: close walk pr-{number} [{verdict}]"
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

## Index Seeding (first-run only)

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
