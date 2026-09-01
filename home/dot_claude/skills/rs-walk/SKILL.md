---
name: rs-walk
description: >-
  PR walkthrough — generates a scrollable review document you read instead of the GitHub diff.
  The document IS the review: context from brain, the author's story, curated diff in reading order,
  a ticket-fit check against the linked Jira ticket (including how well the ticket itself was
  written), sticky-rail risks, questions to bring, a collapsed prior-discussion log classifying
  bot vs human comments, your notes, and a hidden judgment revealed at the end.
  Submits the review to GitHub as the final step.
  Triggers on: "walk this PR", "review deck", "walk PR", "/rs-walk <url>".
version: 0.4.0
---

# rs-walk — PR walkthrough

Takes a PR URL. Builds a scrollable HTML walkthrough you read instead of the GitHub diff.
No slides. The document is the review surface. GitHub is only for submitting.

Requires: `gh` CLI, `node`, `python3`. **No dependency on any other skill.**

Changing the template, the stylesheet or any token? Build the reference walk and
re-run the audit — it is 33 files across 4 sections, which is the density that
actually exposes layout and contrast problems:

```bash
python3 "${SKILL_BIN}/make-test-walk.py" /tmp/rs-walk-fx
WALK_TODAY=$(date +%F) python3 "${SKILL_BIN}/build-walk.py" \
  --pr-meta /tmp/rs-walk-fx/meta.json --diff /tmp/rs-walk-fx/walk.diff \
  --story /tmp/rs-walk-fx/story.json --questions /tmp/rs-walk-fx/questions.json \
  --risks /tmp/rs-walk-fx/risks.json --judgment /tmp/rs-walk-fx/judgment.json \
  --context /tmp/rs-walk-fx/context.json --repo acme/console \
  --ticket-fit /tmp/rs-walk-fx/ticket-fit.json \
  --comment-triage /tmp/rs-walk-fx/comment-triage.json \
  --out-root ~/brain/.scratch/artifact --force
```

The fixture includes both new sections precisely so the audit exercises them — a fixture missing
the sections you're about to change is the same trap as the two-file diff fixture this file warns
about below.

Then Lighthouse it over `http://localhost:52010/scratch/pr-4242-*/walk.html`
**in both themes** — a snapshot audit only tests whichever theme is live. The
target is 100 on accessibility, and it was 94 before the contrast pass, so treat
a drop as a real regression.
rs-walk ships its own template, stylesheet, fonts, index template, and linter
under `assets/` and `bin/`. A walk opens as a file — no server, no network.
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
appended there and show up in the unified artifact index for free.
`ARTIFACT_MODE=standalone` means it doesn't — fall back to rs-walk's own
`wiki/walks/index.html`. This is a file-format coupling, not a dependency: the
file's presence is the whole contract, and its absence is not an error.

Back-links stay **relative** in both modes. A walk is read over `file://` at
least as often as through a server, and a root-absolute `href` resolves to
`file:///…` there. `build-walk.py` rejects one and falls back to the default.

Set constants used throughout:

```bash
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

### Step 2a — Fetch PR comments and reviews (for comment triage)

```bash
bash "${SKILL_BIN}/fetch-pr-comments.sh" "${REPO}" "${PR_NUMBER}"
```

Writes `/tmp/walk-${PR_NUMBER}-raw-comments.json` (`{"comments":[...],"reviews":[...]}`). Non-fatal —
on a gh failure it writes an empty structure and still exits 0. Store as `RAW_COMMENTS`. This data
feeds Agent 6 only (Step 4) — never pass it to Agents 1-4.

### Step 2b — Resolve the linked Jira ticket (for ticket fit)

Extract a ticket key (`[A-Z]+-\d+`) from `PR_META.title` first, then from `PR_BODY` (look for a
`**jira:**` line or a bare `PROJ-1234` token) if the title has none. If no key is found, skip this
step entirely — `TICKET_FIT` stays unset and Step 4 skips Agent 5.

If a key is found, fetch it with whichever Jira MCP tool is available in this session (e.g. a
`get issue`-shaped tool) directly — this is an MCP call, not a shell script. Store the issue's
summary, description, and acceptance criteria as `TICKET_DATA`. If the fetch fails (no access,
ticket deleted), skip the step the same way a missing key does — don't fail the whole walk.

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

Dispatch the applicable agents simultaneously (Agents 1-4 always; Agent 5 only if Step 2b found a
ticket; Agent 6 only if Step 2a found comments). Pass to Agents 1-4:

- `PR_META` (full JSON)
- `FILE_LIST` (contents of `/tmp/walk-${PR_NUMBER}-files.txt`)
- First 400 lines of `/tmp/walk-${PR_NUMBER}.diff`

**Isolation rule — read this before wiring any new input into these prompts.** Agents 1-4 (story,
questions, risks, judgment) never see `RAW_COMMENTS` or `TICKET_DATA`. This is deliberate: the
judgment call (Agent 4) has to be the AI's independent read of the diff, not one already primed by
what reviewers argued about or what the ticket promised. Comment triage (Agent 6) and ticket fit
(Agent 5) are separate, later passes that produce their own sections — they do not feed back into
Agents 1-4, and Agents 1-4's output does not feed into them either. If a future edit needs richer
context in Agent 1-4's prompt, it must not be `RAW_COMMENTS` or `TICKET_DATA`.

**Supplementary question:** if the user's invocation included something beyond the PR URL (e.g.
"also explain X" or "and what does Y mean here"), dispatch an extra agent scoped to that question,
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

### Agent 5 — Ticket fit (only if Step 2b found a ticket)

**Task:** Compare what the ticket asked for against what the PR actually built, and rate how
well the ticket itself was written. This is two separate judgments — don't blend them.

Input: `TICKET_DATA` (summary, description, acceptance criteria), `PR_META`, `PR_BODY`, `FILE_LIST`,
the diff. No `RAW_COMMENTS`.

Return a **JSON object**:

```json
{
  "ticket_key": "PROJ-1234",
  "ticket_quality": {
    "score": "good | adequate | thin | missing",
    "notes": "1-2 sentences: are the AC concrete and checkable, is who/what/why clear?"
  },
  "acceptance_criteria": [
    {
      "criterion": "Restated from the ticket",
      "status": "Met | Partially Met | Not Met | Unplanned Deviation",
      "evidence": "file:line or PR comment reference"
    }
  ],
  "scope_delta": "What the PR does beyond, or short of, what the ticket asked for. Empty string if none."
}
```

Rules:

- `ticket_quality` grades the _ticket_, independent of whether the PR satisfies it — a thin ticket
  that happens to get satisfied is still a thin ticket, and a good ticket partially met is still a
  good ticket.
- If the ticket has no acceptance criteria at all, that alone caps `ticket_quality.score` at `thin`
  and `acceptance_criteria` is `[]` — don't invent AC to fill the table.
- `status: "Unplanned Deviation"` is for scope the PR added that the ticket never mentioned (not
  necessarily bad — flag it, don't judge it here; that's Agent 4's job on the diff, not this one).
- If Step 2b found no ticket, skip this agent — Step 5 renders "no ticket linked" without calling it.

### Agent 6 — Comment triage (only if Step 2a found comments)

**Task:** Classify who said what in the PR's existing discussion, for later reference. This is
classification, not review — do not evaluate whether a comment's concern is valid or already
addressed in the diff; that risks leaking comment-informed opinions back into how you'd frame the
diff, which is exactly what the isolation rule above exists to prevent.

Input: `RAW_COMMENTS` only. No diff, no file list, no `PR_BODY` beyond what's needed to recognize
who's who (e.g. matching a login to the PR author).

Return a **JSON array**, one entry per comment or review body (skip empty/dismissed review shells
with no body text):

```json
[
  {
    "author": "login",
    "author_kind": "bot | human",
    "human_authenticity": "genuine | bot-posing-as-human | uncertain",
    "summary": "One line: what this comment/review actually said.",
    "resolved": true
  }
]
```

Rules:

- `author_kind: "bot"` for accounts that are structurally bots regardless of what they wrote:
  `github-actions`, org review bots (e.g. `groot-production`, `dependabot`), any login with
  `authorAssociation: "NONE"` plus a machine-generated footer/signature.
- `human_authenticity` only applies when `author_kind: "human"`. Default to `"genuine"`. Mark
  `"bot-posing-as-human"` when a real person's account posted content that is clearly tool-authored
  — the tell is a generation footer or signature (e.g. "🤖 Generated with Claude Code") under a human
  login, not the writing style alone. Mark `"uncertain"` rather than guessing either way.
- `resolved: true` only when the thread's own content makes that clear (an "Approve" review, a
  reply confirming a fix, a later commit referenced as addressing it) — never infer resolution from
  the diff, since you're not looking at it here.
- If Step 2a found zero comments, skip this agent — Step 5 renders "no comments yet" without
  calling it.

---

## Step 5 — Assemble walk.html

### Save Step 4's agent outputs to disk

Write each agent's returned JSON to its own file — `build-walk.py` reads them directly:

```bash
# story JSON  → /tmp/walk-${PR_NUMBER}-story.json      {story, groups:[...]}
# questions   → /tmp/walk-${PR_NUMBER}-questions.json   [...]
# risks       → /tmp/walk-${PR_NUMBER}-risks.json       [...]
# judgment    → /tmp/walk-${PR_NUMBER}-judgment.json    {fit, risks_summary, gaps, overall}
# ticket-fit  → /tmp/walk-${PR_NUMBER}-ticket-fit.json   {ticket_key, ticket_quality, acceptance_criteria, scope_delta}
#               only if Agent 5 ran (Step 2b found a ticket)
# comment-triage → /tmp/walk-${PR_NUMBER}-comment-triage.json  [...]
#               only if Agent 6 ran (Step 2a found comments)
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
  [--ticket-fit /tmp/walk-${PR_NUMBER}-ticket-fit.json] \
  [--comment-triage /tmp/walk-${PR_NUMBER}-comment-triage.json] \
  [--force]
```

Omit `--ticket-fit` entirely if Agent 5 didn't run; omit `--comment-triage` entirely if Agent 6
didn't run. Both degrade to an explicit empty-state message in the walk rather than erroring.

This does everything that used to be manual in this step: derives the slug, renders each group's
diffs via `render-diff.sh`, inlines the compiled mate-ds stylesheet, builds the sticky top bar
(wordmark, theme switcher, "all walks" link only — no title, no badges, kept deliberately quiet
since it never leaves the viewport) and an in-content title block at the top of the wide column
(repo eyebrow, PR title linked to GitHub, branch pill — sized as a document heading, not a hero),
injects the sticky rail and toggle JS, opens all links in a new tab, renders the ticket-fit
section (right after "The story") and the collapsed prior-discussion section (after the questions
section) when their inputs are present, writes `meta.json` (auto-extracting `PROJ-XXXX`-style
ticket IDs from the title and merging them with `--tags`, plus `ticket_key`/`ticket_quality`/
`comment_counts` when those inputs were given), and runs the lint binary — printing violations to
stderr if any remain. It prints the walk directory path on success.

The template has 1 pre-existing violation (`inlined-css`) plus several `small-font` violations
inside the inlined stylesheet and the header/footer chrome — all template-origin, not from agent
content. These are expected for a self-contained file; the script already warns about this. If the
script reports violations tied to a line inside the actual content (story, diffs, questions,
judgment), something in the agent-supplied JSON produced bad HTML — read the violation, fix the
source JSON or the script, and re-run with `--force`.

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

**First, recover the notes written while reading.** The per-section textareas
persist to `localStorage` under `walk-note-{PR_NUMBER}-{section}`. Do not ask
for them again — read them out of the open page:

```
mcp__chrome-devtools__evaluate_script on the walk page:
  () => Object.fromEntries(
    Object.entries(localStorage)
      .filter(([k]) => k.startsWith("walk-note-<PR_NUMBER>-"))
      .map(([k, v]) => [k.split("-").pop(), v])
  )
```

`localStorage` is origin-scoped, so read from a page on the same origin the
walk was read on — `file://` pages all share one bucket. If the tab is closed,
reopen the walk first.

If chrome-devtools is unavailable, ask the reader to click **Export notes** in
the walk (calls `exportWalkNotes()`, downloads `walk-notes-{PR}.json` to
`~/Downloads`) and pass that file as argument 5 to `close-walk.sh`.

Write the recovered notes to `.scratch/walk-notes-${PR_NUMBER}.json` and show
them back for confirmation rather than asking cold.

If **Request changes** or **Comment only**:

```
AskUserQuestion: "Anything to add beyond the section notes?" (free text)
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
bash "${SKILL_BIN}/close-walk.sh" "${WALK_DIR}" "${PR_NUMBER}" "{verdict}" "{notes}" \
  "${HOME}/brain/.scratch/walk-notes-${PR_NUMBER}.json"
```

3. Stage and commit the learning entry:

```bash
git -C ~/brain add wiki/learning/walk-pr-${PR_NUMBER}-${SLUG}.md
git -C ~/brain commit -m "chore: walk pr-${PR_NUMBER} learning entry"
```

---

## Edge cases

| Situation                             | Behavior                                                                                  |
| ------------------------------------- | ----------------------------------------------------------------------------------------- |
| PR body empty                         | Infer story from diff; note "No description — inferred from diff" in story section        |
| Diff > 2000 lines                     | Cap per-group at 80 lines; add "[diff large — showing key hunks only]" note in each group |
| > 20 changed files                    | Agent 1 caps at 5 groups, merges minor files into nearest logical group                   |
| Walk already exists                   | Ask: "Overwrite existing walk at `{WALK_DIR}`? [y/N]"                                     |
| Lint fails                            | Surface each violation with file:line. Fix before opening.                                |
| qmd update slow on first run          | Print: "Indexing brain — first run, may take ~60s"                                        |
| gh review fails                       | Surface error verbatim. meta.json stays with `verdict: null`.                             |
| User skips submission                 | meta.json stays with `verdict: null`. Walk stays in index as "pending".                   |
| No ticket key found in title/body     | Skip Agent 5 and `--ticket-fit`. Ticket fit section renders "no ticket linked."           |
| Jira fetch fails (no access, deleted) | Same as no ticket found — skip, don't fail the walk.                                      |
| PR has zero comments/reviews          | Skip Agent 6 and `--comment-triage`. Prior discussion section renders "no comments yet."  |
| `fetch-pr-comments.sh` gh call fails  | Non-fatal — writes empty `{"comments":[],"reviews":[]}`, same as zero comments.           |
| Ticket has no acceptance criteria     | `ticket_quality.score` caps at `thin`; `acceptance_criteria` stays `[]`, not invented.    |

---

## Index Seeding (first-run only, `ARTIFACT_MODE=standalone` only)

Skip this entirely when `ARTIFACT_MODE=json` — the unified
`wiki/artifact/index.html` already exists and renders `type: "walk"` entries.

When `~/brain/wiki/walks/index.html` does not exist:

1. Read `${SKILL_ROOT}/assets/index-template.html` — rs-walk's own, already
   carrying the table shell, theme toggle, and `<!-- MAIN_CSS -->` slot
2. Replace `<!-- TITLE -->` (all occurrences) with `PR Walk Index`
3. Replace `<!-- DATE -->` occurrences with today's date
4. Replace `<!-- MAIN_CSS -->` with `<style>` + the contents of
   `${SKILL_ROOT}/assets/walk.css`, and `<!-- GENERATOR -->` with the same
   `<meta name="generator">` stamp `build-walk.py` emits
5. Leave `<!-- CONTENT -->` in place — it is where each run inserts its `<tr>`

Row shape, one per walk (`close-walk.sh` patches the verdict cell by
`id="walk-pr-{number}"`):

```html
<tr id="walk-pr-{number}">
  <td class="pr"><a href="pr-{number}-{slug}/walk.html">#{number}</a></td>
  <td><a href="pr-{number}-{slug}/walk.html">{title}</a></td>
  <td>{author}</td>
  <td class="date">{date}</td>
  <td>{tags}</td>
  <td class="walk-verdict"><span class="badge badge-ghost">pending</span></td>
</tr>
```

6. Write to `~/brain/wiki/walks/index.html`
7. Lint it: `node "${SKILL_BIN}/lint-walk.mjs" ~/brain/wiki/walks/index.html`
8. Commit: `git -C ~/brain add wiki/walks/ && git -C ~/brain commit -m "chore: init walks index"`
