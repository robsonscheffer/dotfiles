---
name: rs-walk
description: >-
  Generate a structured PR review slide deck from a GitHub PR URL using Decklet.
  Triggers on: "walk slides for this PR", "review deck", "slide deck for this PR",
  "walk this PR", "make a deck from this PR".
  Does NOT trigger on generic "make me a deck" / "create slides".
version: 0.2.0
---

# rs-walk — PR review slide deck from a GitHub PR URL

Takes a PR URL, fetches the PR data, and generates a structured Decklet HTML
slide deck organized as: Intent → Changes → Comprehension → Judgment.

No sessions. No mate. Requires `gh` CLI and Decklet.

---

## Step 0 — Preflight

### Locate decklet

```bash
# 1. Symlink override
DECKLET_SKILL_LINK=~/.claude/skills/decklet
if [ -L "${DECKLET_SKILL_LINK}" ]; then
  DECKLET_BIN="$(readlink "${DECKLET_SKILL_LINK}")/bin"

# 2. Discover under ~/apps
elif DECKLET_PLUGIN=$(find ~/apps -maxdepth 5 -type d -name "decklet" 2>/dev/null | grep "plugins/decklet$" | head -1); [ -n "$DECKLET_PLUGIN" ]; then
  DECKLET_BIN="${DECKLET_PLUGIN}/bin"

else
  echo "Decklet not found. Install the decklet plugin or create a ~/.claude/skills/decklet symlink." >&2
  exit 1
fi
```

If `${DECKLET_BIN}/build` is not executable, stop.

### Verify gh CLI

```bash
gh auth status 2>/dev/null || echo "gh not authenticated"
```

If `gh` is missing or not authenticated, stop with:

> "`gh` CLI required. Install with `brew install gh` then `gh auth login`."

---

## Step 1 — Resolve PR URL

Accept:

- Full URL: `https://github.com/org/repo/pull/123`
- Short form: `org/repo#123`

Extract: `PR_URL` (canonical full URL), `PR_NUMBER`, `REPO` (`org/repo`).

If no argument provided, ask: "Which PR? (paste the URL)"

---

## Step 2 — Fetch PR data

```bash
gh pr view "${PR_URL}" --json \
  number,title,body,author,headRefName,baseRefName,\
  additions,deletions,changedFiles,url,commits \
  2>/dev/null
```

Also fetch the diff — truncate to 600 lines if larger:

```bash
gh pr diff "${PR_URL}" 2>/dev/null | head -600
```

If the PR cannot be fetched (private repo, auth issue), stop with the gh error verbatim.

Store as: `PR_META` (JSON), `PR_DIFF` (text).

---

## Step 3 — Generate slide content via parallel subagents

Dispatch 3 subagents simultaneously using the Agent tool. Each reads the full
PR data independently — no anchoring from each other's output. Collect all
results before assembling.

Pass to every agent: `PR_META` (full JSON), `PR_DIFF` (truncated diff text),
`PR_URL`.

---

### Agent 1 — Intent + Changes

**Task:** Produce the Intent summary and Changes slides.

Intent (slide A2):

- Summarize the PR body in 3–5 bullets: what is this PR doing and why?
- If the body is empty, infer intent from the diff.

Changes (1–5 slides):

- Group changed files into logical areas by what they do, not where they live.
- Per group: short action-phrase title, list of files, 2–4 narrative bullets.
- Include relevant diff excerpt in speaker notes (max 40 lines, inside `<!-- ... -->`).
- Diff excerpts never appear in the slide body.

**Return:** raw Marp markdown for slides A2 through B-last (no frontmatter,
no `---` at start or end — just the slide bodies separated by `\n---\n`).

---

### Agent 2 — Comprehension questions

**Task:** Write 2–3 questions a careful reviewer would ask. Read the diff
fresh — do not restate what Agent 1 would say.

- Questions target _why_, not _what_.
- One question per slide: short title + 1–2 sentence question body.
- Answer field: leave blank, render as `_Not yet answered_`.

**Return:** raw Marp markdown for comprehension slides (same format as
Agent 1 — slide bodies separated by `\n---\n`).

---

### Agent 3 — Judgment

**Task:** Write an honest verdict based on the diff and PR description alone.
Do not soften findings. Do not inflate confidence.

- Fit: does this approach solve the right problem?
- Confidence: how complete is the implementation?
- Gaps: what is missing, risky, or untested? ("None identified" only if genuinely true.)

**Return:** raw Marp markdown for the single judgment slide.

---

### Assembly

Wait for all 3 agents. Then combine:

**Title slide (A1) — you write this inline:**

```markdown
<!-- _class: centered invert -->

<div class="slide-hero">{PR_META.title}</div>
<div class="intro">By {PR_META.author.login} · #{PR_META.number}</div>
<div class="slide-small"><a href="{PR_URL}">#{PR_META.number}</a></div>
```

Then append Agent 1 output, Agent 2 output, Agent 3 output in order,
each block separated by `\n---\n`.

---

## Step 4 — Assemble src/deck.md

```markdown
---
marp: true
theme: structured
paginate: true
title: { title }
---

<!-- _class: centered invert -->

<div class="slide-hero">{PR_META.title}</div>
<div class="intro">By {author} · #{number}</div>
<div class="slide-small"><a href="{PR_URL}">#{number}</a></div>

---

## Intent

{A2 bullet summary}

---

###### CHANGES

## {B1 group title}

**Files:** {files}

{narrative bullets}

<!-- diff excerpt -->

---

... (one --- between every slide)

---

###### COMPREHENSION

## {C1 question title}

{question text}

_Not yet answered_

---

... remaining comprehension slides ...

---

<!-- _class: centered invert -->

###### JUDGMENT

- **Fit:** {fit assessment}
- **Confidence:** {confidence assessment}
- **Gaps:** {gaps or "None identified"}
```

Rules:

- `marp: true`, `theme: structured`, `paginate: true`, `title` — no other frontmatter keys.
- Exactly one `---` between every slide.
- Diff excerpts inside `<!-- ... -->` only — never in the slide body.

---

## Step 5 — Build

```bash
DECK_SLUG="pr-$(echo ${PR_URL} | grep -oE '[0-9]+$' | head -1)"
DECK_PATH=~/.decklet/${DECK_SLUG}

${DECKLET_BIN}/new ${DECK_PATH}
# Write assembled deck.md to ${DECK_PATH}/src/deck.md
${DECKLET_BIN}/build ${DECK_PATH} < /dev/null
```

`< /dev/null` on build is required — Marp hangs on inherited stdin.

If build fails, surface the full error verbatim. Do not open.

On success:

```bash
open ${DECK_PATH}/deck.html
```

---

## Step 6 — Offer to publish

> "Deck opened. Publish to get a share URL? [y/N]"

If yes:

```bash
${DECKLET_BIN}/publish ${DECK_PATH}
```

Relay the URL verbatim.

---

## Completion message

> "Walk deck for #{number} ready — {N} slides (intent, {X} changes,
> {Y} comprehension, judgment). Deck at `~/.decklet/{slug}/deck.html`."

If published: append "Share URL: {url}"

---

## Edge cases

| Situation                | Behavior                                                        |
| ------------------------ | --------------------------------------------------------------- |
| PR body empty            | Infer intent from diff; note "No description" on intent slide   |
| Diff > 600 lines         | Truncate; note "[diff truncated at 600 lines]" in speaker notes |
| > 20 changed files       | Group aggressively; cap at 5 change slides                      |
| Private repo / auth fail | Stop with gh error verbatim                                     |
| Deck already exists      | Ask: "Overwrite existing deck at `~/.decklet/{slug}/`? [y/N]"   |
| Decklet build fails      | Surface error verbatim; do not open                             |
