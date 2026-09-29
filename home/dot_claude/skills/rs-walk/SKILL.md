---
name: rs-walk
description: >-
  PR walkthrough — generates a scrollable review document you read instead of the GitHub diff.
  The document IS the review: context from brain, the author's story, curated diff in reading order,
  a ticket-fit check against the linked Jira ticket (including how well the ticket itself was
  written), sticky-rail risks, questions to bring, a collapsed prior-discussion log classifying
  bot vs human comments, your notes, and a hidden judgment revealed at the end.
  Submits the review to GitHub as the final step.
  Triggers on: "walk this PR", "review deck", "walk PR", "/rs-walk <url>", "/rs-walk <url>
  --mate-doc" (opt-in mate-doc path).
version: 0.4.0
---

# rs-walk — PR walkthrough

Takes a PR URL. Builds a scrollable HTML walkthrough you read instead of the GitHub diff.
No slides. The document is the review surface. GitHub is only for submitting.

Requires: `gh` CLI, `node`, `python3`. **No dependency on any other skill.** Full agent
task/schema/rules live in `AGENT-PROMPTS.md`; rare first-run and fallback paths live in
`REFERENCE.md`. Both are in this skill's directory — read them when the relevant step says to.

Changing the template, stylesheet, or a token? Rebuild the reference walk and re-run the audit
(it's 33 files across 4 sections — the density that actually exposes layout/contrast bugs):

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

The fixture includes the ticket-fit and comment-triage sections so the audit exercises both. Then,
to Lighthouse it, point the mate-doc viewer at the scratch dir once (`mate-doc open
~/brain/.scratch/artifact --alias artifacts`) and hit
`http://localhost:52010/artifacts/pr-4242-*/walk.html` **in both themes** (a snapshot
audit only tests whichever theme is live) — target 100 accessibility; it was 94 before the
contrast pass, so treat a drop as a real regression. rs-walk ships its own template, stylesheet,
fonts, index template, and linter under `assets/` and `bin/`. A walk opens as a file — no server,
no network. Optional: `qmd` for semantic brain search (falls back to grep).

---

## Step 0 — Preflight

```bash
SKILL_BIN=~/.claude/skills/rs-walk/bin
PREFLIGHT_OUT=$(bash "${SKILL_BIN}/preflight.sh") || exit 1
CONTEXT_MODE=$(echo "${PREFLIGHT_OUT}" | grep CONTEXT_MODE | cut -d= -f2)   # qmd|grep
ARTIFACT_MODE=$(echo "${PREFLIGHT_OUT}" | grep ARTIFACT_MODE | cut -d= -f2)  # json|standalone
```

If the script exits non-zero, surface the error message and stop.

`ARTIFACT_MODE=json` means `~/brain/wiki/artifact/artifacts.json` exists — walks get appended
there and show up in the unified artifact index for free. `ARTIFACT_MODE=standalone` means it
doesn't — fall back to rs-walk's own `wiki/walks/index.html` (file presence is the whole contract,
not a dependency). If standalone and that index doesn't exist yet, seed it per `REFERENCE.md`.

Back-links stay **relative** in both modes — a walk is read over `file://` at least as often as
through a server, and a root-absolute `href` resolves to `file:///…` there. `build-walk.py`
rejects one and falls back to the default.

```bash
WALKS_DIR=~/brain/wiki/walks
WALKS_INDEX="${WALKS_DIR}/index.html"
ARTIFACTS_JSON=~/brain/wiki/artifact/artifacts.json
```

---

## Step 1 — Resolve PR URL

Accept a full URL (`https://github.com/org/repo/pull/123`) or short form (`org/repo#123`).
Extract `PR_NUMBER` and `REPO`. If no argument given, ask: "Which PR? (paste the URL)"

---

## Step 2 — Fetch PR data

```bash
bash "${SKILL_BIN}/fetch-pr.sh" "${REPO}" "${PR_NUMBER}"
```

Writes `/tmp/walk-${PR_NUMBER}-meta.json`, `-body.txt`, `.diff`, `-files.txt`. `body` is its own
`gh` call — PR bodies routinely carry control characters that break `jq` when bundled into the
same `--json` blob as the other fields. Never re-combine them. If fetch fails, stop with the
script's error verbatim. Store `PR_META`, `PR_BODY`, the diff path, and the files path.

**Step 2a — comments/reviews (for comment triage):**

```bash
bash "${SKILL_BIN}/fetch-pr-comments.sh" "${REPO}" "${PR_NUMBER}"
```

Writes `/tmp/walk-${PR_NUMBER}-raw-comments.json` (`{"comments":[...],"reviews":[...]}`).
Non-fatal — a gh failure writes an empty structure and exits 0. Store as `RAW_COMMENTS`. Feeds
Agent 6 only — never pass it to Agents 1-4.

**Step 2b — linked ticket (for ticket fit):**

Extract a ticket key (`[A-Z]+-\d+`) from `PR_META.title` first. If none, check `PR_BODY` for a
labeled field (`**jira:**`, `**ticket:**`) before falling back to a bare scan of the prose — a
labeled field wins even when empty (that's a real "no ticket" signal). On a bare scan, exclude any
key inside a clause pointing at a _different_ PR as background ("unrelated PR", "found via", "a
prior ticket") — it belongs to that PR, not this one. No key survives → skip; `TICKET_FIT` stays
unset and Step 4 skips Agent 5.

If a key is found, fetch it with whichever Jira MCP tool is available this session (an MCP call,
not a shell script). Store summary/description/AC as `TICKET_DATA`. Fetch failure (no access,
deleted) → skip the same way a missing key does. Don't fail the whole walk either way.

---

## Step 3 — Context search

Key terms: PR title words + top 5 changed-file basenames (no extension).

**qmd mode:** `qmd query "{key terms}" --json -c brain -c walks -n 8 2>/dev/null` — for each hit
extract `path`, `score`, `snippet`, format `- [{score}%] {path}: {snippet}`.

**grep mode:** `grep -rl "{term1}\|{term2}\|{term3}" ~/brain/wiki/ 2>/dev/null | grep -v
"walks/index" | head -8`

Store as `CONTEXT_RESULTS` (10 lines max). Nothing found in either mode →
`"Nothing found in brain for this area — first walk in this territory."`

---

## Step 4 — Parallel agents

Dispatch what applies, simultaneously: Agents 1-4 always, Agent 5 only if Step 2b found a ticket,
Agent 6 only if Step 2a found comments. Full task/schema/rules for each: `AGENT-PROMPTS.md`.

| #   | Agent               | Input                                        | Output                                                                         |
| --- | ------------------- | -------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | Story + reading map | `PR_META`, `FILE_LIST`, first 400 diff lines | object: `story`, `groups[]`                                                    |
| 2   | Questions           | same as 1                                    | array                                                                          |
| 3   | Risk                | same as 1                                    | array                                                                          |
| 4   | Judgment            | same as 1                                    | object: `fit`, `risks_summary[]`, `gaps[]`, `overall`                          |
| 5   | Ticket fit          | `TICKET_DATA`, `PR_META`, `PR_BODY`, diff    | object: `ticket_key`, `ticket_quality`, `acceptance_criteria[]`, `scope_delta` |
| 6   | Comment triage      | `RAW_COMMENTS` only                          | array                                                                          |

**Isolation rule — read before wiring any new input into these prompts.** Agents 1-4 never see
`RAW_COMMENTS` or `TICKET_DATA`. Agent 4's judgment has to be an independent read of the diff, not
one primed by what reviewers argued about or what the ticket promised. Agents 5 and 6 are separate,
later passes with their own sections — they don't feed Agents 1-4, and Agents 1-4 don't feed them.
Any future input beyond what's in the table above must not be `RAW_COMMENTS` or `TICKET_DATA`.

**Supplementary question:** if the invocation included something beyond the PR URL ("also explain
X"), dispatch an extra agent scoped to that question. Explanatory, not reviewer-facing — its own
section right after "The story" (Step 5), not folded into Questions or Risks. Plain text, ~300
words max.

---

## Step 5 — Assemble walk.html

Write each agent's JSON to its own file: `-story.json`, `-questions.json`, `-risks.json`,
`-judgment.json`, and if they ran, `-ticket-fit.json` / `-comment-triage.json`. Build
`-context.json` from Step 3 (`{"mode": "qmd"|"grep", "items": [...]}`; empty items renders the
"nothing found" fallback). If there's a supplementary answer, write it to `-extra.json` as
`[{"title": "...", "body": "..."}]` — omit `--extra-sections` entirely if there's nothing to add.

Derive the slug and walk dir:

```bash
SLUG=$(echo "${PR_META}" | jq -r '.title' | tr '[:upper:]' '[:lower:]' | \
  sed 's/[^a-z0-9 ]//g' | tr ' ' '-' | cut -c1-40 | sed 's/-$//')
WALK_DIR=~/brain/wiki/walks/pr-$(echo "${PR_META}" | jq -r '.number')-${SLUG}
```

If `${WALK_DIR}` exists, ask before passing `--force`: "Overwrite existing walk? [y/N]"

```bash
WALK_TODAY=$(date +%Y-%m-%d) python3 "${SKILL_BIN}/build-walk.py" \
  --pr-meta /tmp/walk-${PR_NUMBER}-meta.json --diff /tmp/walk-${PR_NUMBER}.diff \
  --story /tmp/walk-${PR_NUMBER}-story.json --questions /tmp/walk-${PR_NUMBER}-questions.json \
  --risks /tmp/walk-${PR_NUMBER}-risks.json --judgment /tmp/walk-${PR_NUMBER}-judgment.json \
  --context /tmp/walk-${PR_NUMBER}-context.json --repo "${REPO}" \
  --tags "{2-3 topic words, comma separated}" \
  [--extra-sections /tmp/walk-${PR_NUMBER}-extra.json] \
  [--ticket-fit /tmp/walk-${PR_NUMBER}-ticket-fit.json] \
  [--comment-triage /tmp/walk-${PR_NUMBER}-comment-triage.json] \
  [--force]
```

Omit `--ticket-fit`/`--comment-triage` entirely when the matching agent didn't run — both degrade
to an explicit empty-state message rather than erroring. The script derives the slug, renders each
group's diffs, inlines the stylesheet, builds the sticky bar and title block, injects the sticky
rail and toggle JS, opens links in a new tab, writes `meta.json` (ticket IDs auto-extracted from
the title plus `--tags`, and `ticket_key`/`ticket_quality`/`comment_counts` when given), and runs
the lint binary, printing violations to stderr. It prints the walk dir path on success.

The template carries 1 pre-existing `inlined-css` violation plus `small-font` violations in the
inlined stylesheet/chrome — expected, template-origin. A violation tied to actual content (story,
diffs, questions, judgment) means the agent JSON produced bad HTML — fix the source and re-run
with `--force`. Once lint passes (or only the template-origin violations remain): `open
"${WALK_DIR}/walk.html"`.

---

## Step 6 — Update walks index

`ARTIFACT_MODE=json` — append to `${ARTIFACTS_JSON}` (path is browser-relative from
`/artifacts/index.html`; the mate-doc viewer serves `wiki/walks/` under its own remembered-folder
alias, separate from whatever folder `${ARTIFACTS_JSON}` lives in):

```bash
jq --arg title "#{number} — {title}" --arg created "{today}" \
   --arg file "../walks/pr-{number}-{slug}/walk.html" \
   '. += [{"title": $title, "type": "walk", "tier": "wiki", "created": $created, "url": null, "file": $file}]' \
   "${ARTIFACTS_JSON}" > "${ARTIFACTS_JSON}.tmp" && mv "${ARTIFACTS_JSON}.tmp" "${ARTIFACTS_JSON}"
```

`ARTIFACT_MODE=standalone` — insert a `<tr>` into `wiki/walks/index.html`; row shape in
`REFERENCE.md`.

Commit either mode: `git -C ~/brain add wiki/walks/ wiki/artifact/artifacts.json 2>/dev/null &&
git -C ~/brain commit -m "chore: walk pr-{number} {title, ≤60 chars}"`

---

## Step 7 — Post-review submission

After the user has read the walk and written notes, ask (AskUserQuestion): "Ready to submit?" —
Approve | Request changes | Comment only | Skip for now.

**Skip:** stop. Remind: `gh pr review {number} --repo {REPO} --approve` when ready.

**Approve:** first recover the notes written while reading — they persist to `localStorage` under
`walk-note-{PR_NUMBER}-{section}`. Don't ask again; read them from the open page:

```
mcp__chrome-devtools__evaluate_script:
  () => Object.fromEntries(Object.entries(localStorage)
    .filter(([k]) => k.startsWith("walk-note-<PR_NUMBER>-"))
    .map(([k, v]) => [k.split("-").pop(), v]))
```

`localStorage` is origin-scoped — read from the same origin the walk was read on (`file://` pages
share one bucket); reopen the walk if the tab is closed. No chrome-devtools access → ask the
reader to click **Export notes** (downloads `walk-notes-{PR}.json` to `~/Downloads`), pass that as
argument 5 to `close-walk.sh`. Write recovered notes to `.scratch/walk-notes-${PR_NUMBER}.json`
and show them back for confirmation before proceeding. Then: `gh pr review ${PR_NUMBER} --repo
"${REPO}" --approve`

**Request changes / Comment only:** ask "Anything to add beyond the section notes?" (free text),
then `gh pr review ${PR_NUMBER} --repo "${REPO}" --request-changes --body "{comment}"` (or
`--comment`).

**Closing the loop, after any submission:**

1. Write `~/brain/wiki/learning/walk-pr-{number}-{slug}.md` — template in `REFERENCE.md`.
2. `bash "${SKILL_BIN}/close-walk.sh" "${WALK_DIR}" "${PR_NUMBER}" "{verdict}" "{notes}"
"${HOME}/brain/.scratch/walk-notes-${PR_NUMBER}.json"` — handles meta.json, index badge,
   log.md, qmd re-index, commit.
3. `git -C ~/brain add wiki/learning/walk-pr-${PR_NUMBER}-${SLUG}.md && git -C ~/brain commit -m
"chore: walk pr-${PR_NUMBER} learning entry"`

---

## mate-doc path (opt-in: `/rs-walk <url> --mate-doc`)

The default flow above (Steps 0-7) is what this skill runs. This path only runs when the
invocation explicitly passes `--mate-doc`, and it stays opt-in until it has been checked end to
end on a real PR. Say that plainly to the user before running it.

1. Fetch the raw PR: `mate-doc walk <url> --fetch-only --out <dir>`. Writes `meta.json`,
   `body.txt`, `diff.patch`, `files.txt`, `comments.json` into `<dir>`.
2. Dispatch the same agents Step 4 already defines, with the same inputs and the same isolation
   rule, per the task/schema/rules in `AGENT-PROMPTS.md`. Don't copy or restate those prompts
   here. Write each agent's JSON into `<dir>` under the filenames `mate-doc walk --inputs` reads:
   `story.json`, `questions.json`, `risks.json`, `judgment.json`, and, when they ran,
   `ticket-fit.json` / `comment-triage.json` / `context.json`.
3. Compose the walk: `mate-doc walk <url> --inputs <dir> --out <walk-dir>`.
4. Check it: `mate-doc lint <walk-dir>` then `mate-doc gate <walk-dir>`. Fix the source and
   re-run either on a failure before opening.
5. Open it for reading: `mate-doc open <walk-dir>`.
6. After the user has read the walk and written notes, ask (AskUserQuestion) the same "Ready to
   submit?" question as Step 7: Approve, Request changes, Comment only, or Skip for now. Export
   the reader's notes from the open walk page (its own **Download notes JSON** control) to a
   file, then run `mate-doc walk submit <walk-dir> --<mode> --notes-file <exported notes>`
   without `--yes` first; this only prints the body and the exact `gh` command, and posts
   nothing. Show that dry run to the user. Only after an explicit yes, run the same command again
   with `--yes` added.
7. Close the loop: `mate-doc walk close <walk-dir> --verdict <verdict> --notes-file <exported
notes>`. This runs the user's own `walk.close_hook`, if one is configured: the equivalent of
   this skill's own bookkeeping in Step 7, kept out of this repo the same way.

---

## Edge cases

| Situation                    | Behavior                                                                |
| ---------------------------- | ----------------------------------------------------------------------- |
| PR body empty                | Infer story from diff; note "No description — inferred from diff"       |
| Diff > 2000 lines            | Cap per-group at 80 lines; add "[diff large — key hunks only]" note     |
| > 20 changed files           | Agent 1 caps at 5 groups, merges minor files into nearest group         |
| Walk already exists          | Ask before `--force`                                                    |
| Lint fails                   | Surface each violation with file:line; fix before opening               |
| qmd slow on first run        | Print "Indexing brain — first run, may take ~60s"                       |
| gh review fails              | Surface error verbatim; `meta.json` stays `verdict: null`               |
| User skips submission        | `meta.json` stays `verdict: null`; walk stays "pending"                 |
| No ticket key found          | Skip Agent 5/`--ticket-fit`; section renders "no ticket linked"         |
| Jira fetch fails             | Same as no ticket found — skip, don't fail the walk                     |
| PR has zero comments         | Skip Agent 6/`--comment-triage`; section renders "no comments yet"      |
| `fetch-pr-comments.sh` fails | Non-fatal — empty structure, same as zero comments                      |
| Ticket has no AC             | `ticket_quality.score` caps at `thin`; `acceptance_criteria` stays `[]` |
