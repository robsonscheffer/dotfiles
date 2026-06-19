---
name: rs-walk
description: >-
  Convert a mate walk PR-review session into a Decklet HTML slide deck.
  Triggers on: "slide deck for this walk", "render walk as slides",
  "make a deck from this review", "walk slides", "decklet this PR".
  Does NOT trigger on generic "make me a deck" / "create slides".
version: 0.1.0
---

# rs-walk — Convert a mate walk session into a Decklet HTML slide deck

Pure rehydration: read existing phase `.md` files from a completed or
in-progress `mate walk` session and transform them into a self-contained
Decklet HTML slide deck. No AI re-generation of content.

---

## Step 0 — Locate decklet

Resolve the decklet binary path — check in order, first match wins:

```bash
# 1. Explicit symlink override
DECKLET_SKILL_LINK=~/.claude/skills/decklet
if [ -L "${DECKLET_SKILL_LINK}" ]; then
  DECKLET_BIN="$(readlink "${DECKLET_SKILL_LINK}")/bin"

# 2. Discover via find — works regardless of the parent dir name
elif DECKLET_PLUGIN=$(find ~/apps -maxdepth 5 -type d -name "decklet" 2>/dev/null | grep "plugins/decklet$" | head -1); [ -n "$DECKLET_PLUGIN" ]; then
  DECKLET_BIN="${DECKLET_PLUGIN}/bin"

else
  echo "Decklet not found under ~/apps. Install the decklet plugin or set a ~/.claude/skills/decklet symlink." >&2
  exit 1
fi
```

If `${DECKLET_BIN}/build` is not executable after resolution, stop with the same error.

Never hardcode an absolute path with an org or repo name in it.

---

## Step 1 — Resolve review_id

```
If <review-id> was provided as an explicit argument → use it directly.

Else:
  Run: mate walk status -f json
  Parse the JSON output → extract the "review_id" field.
  If the command fails or returns empty / null:
    Stop with: "No active walk session found. Start one with `mate walk <pr>`
    or pass a review-id explicitly."
```

Name the resolved value `REVIEW_ID`.

---

## Step 2 — Locate and verify session files

```
SESSION_DIR=~/.mate/sessions/${REVIEW_ID}/walk
```

1. `${SESSION_DIR}/session.md` — if absent: stop with "No walk session found for `${REVIEW_ID}`."
2. `${SESSION_DIR}/intent.md` — if absent: stop with the same error.
3. `${SESSION_DIR}/changes.md` — if absent: warn and prompt "Continue without changes slides? [y/N]". Stop on N.
4. `${SESSION_DIR}/comprehension.md` — same warn-and-prompt.
5. `${SESSION_DIR}/judgment.md` — same warn-and-prompt.

Never silently skip a phase. Never call `mate walk prepare` without asking — it triggers AI calls.

---

## Step 3 — Load session metadata

Parse YAML frontmatter from `${SESSION_DIR}/session.md` (between the opening `---` and the next `---`).

| Field       | Used for                                           |
| ----------- | -------------------------------------------------- |
| `pr_title`  | Marp `title:` and title slide hero text            |
| `pr_url`    | Title slide link — use verbatim, no reconstruction |
| `prid`      | Title slide subtitle (e.g. `#16310`)               |
| `author`    | Title slide subtitle                               |
| `outcome`   | Judgment slide verdict                             |
| `flags[]`   | Judgment slide flag count                          |
| `answers[]` | Indexed answers for comprehension + judgment       |

**`pr_url` is the canonical link source.** Never reconstruct a GitHub URL from
org/repo assumptions. If `pr_url` is absent, omit the link entirely rather
than guessing.

`answers[]` is ordered. Index `i` maps to question `i` across comprehension
then judgment slides (in phase order). Use index-safe lookup: `answers[i]` if
`i < len(answers)` else nil.

---

## Step 4 — Parse phase files

Each phase file contains multiple slides separated by:

```
---
---
```

**Split rule:** split on `\n---\n---\n` (or `---\n---\n` at file start). This
yields raw chunks. Do not confuse with a single `\n---\n` (Marp slide separator).

**Per-chunk parsing:**

1. Strip any leading `---\n`.
2. Parse the YAML frontmatter block (up to the first standalone `---`).
3. Remainder after the closing `---` is the body text.

Fields used per chunk:

```yaml
kind: # "intent" | "changes" | "comprehension" | "judgment"
title: # slide heading
files: [] # file paths (changes slides)
diff_excerpt: # raw diff — SPEAKER NOTES ONLY, never in slide body
beats:
  - narrative: # bullet shown in slide body
    range: # file range (speaker notes only)
context: # code snippet for comprehension slides (truncate to 20 lines)
language: # syntax hint for context block
prompt: # question text for comprehension slides
```

**Truncation:**

- `diff_excerpt` → speaker notes only; if > 50 lines, keep first 50 and append `[TRUNCATED: N more lines]`.
- `context` → inline code block; if > 20 lines, truncate to 20 and append `[… truncated]`.

---

## Step 5 — Transform to Marp slides

### intent.md → 2 slides

**Slide 1 — Title** (`<!-- _class: centered invert -->`):

```markdown
<!-- _class: centered invert -->

<div class="slide-hero">{pr_title}</div>
<div class="intro">By {author} · {prid}</div>
<div class="slide-small"><a href="{pr_url}">{prid}</a></div>
```

If `pr_url` is absent, omit the `<div class="slide-small">` line entirely.

**Slide 2 — Intent summary:**

```markdown
## Intent

{body text from intent.md chunk}
```

### changes.md → 1 slide per chunk

```markdown
###### CHANGES

## {title}

**Files:** {files joined by ", "}

{beats[].narrative as bullet list, one `-` per beat}

<!-- {diff_excerpt — TRUNCATED if > 50 lines} -->
```

`diff_excerpt` lives inside `<!-- ... -->` only. It must never appear outside
a comment block. If a future revision accidentally places it in the body,
that is a bug.

### comprehension.md → 1 slide per chunk

Answer index `i` = 0-based position of this chunk within the comprehension
phase. Map to `answers[i]`.

````markdown
###### COMPREHENSION

## {title}

{prompt}

```{language}
{context — max 20 lines}
```

**Answer:** {answers[i].text} ← if answered
_Not yet answered_ ← if absent or empty

<!-- Speaker notes: comprehension answer {i} -->
````

### judgment.md → 1 slide (all judgment chunks collapsed)

```markdown
<!-- _class: centered invert -->

###### JUDGMENT

## Verdict: {outcome}

**Flags:** {len(flags)} findings

- Fit: {answers[comprehension_count + 0].text or "not answered"}
- Confidence: {answers[comprehension_count + 1].text or "not answered"}
- Gaps: {answers[comprehension_count + 2].text or "not answered"}
```

`comprehension_count` = number of comprehension slides generated.

If `outcome` is absent or empty → `"in-progress"`.
If `flags[]` is empty → `"0 findings"`.

---

## Step 6 — Assemble src/deck.md

```markdown
---
marp: true
theme: structured
paginate: true
title: { pr_title }
---

{title slide}

---

{intent slide}

---

{changes slide 1}

---

{changes slide 2}

---

...

{comprehension slide 1}

---

...

{judgment slide}
```

Rules:

- Exactly `marp: true`, `theme: structured`, `paginate: true`, `title` — no other keys.
- One `---` separator between every slide.
- Skipped phases produce no slides and no extra separators.

---

## Step 7 — Scaffold, build, open

```bash
DECK_PATH=~/.decklet/walk-${REVIEW_ID}

${DECKLET_BIN}/new ${DECK_PATH}
# Write assembled deck.md to ${DECK_PATH}/src/deck.md
${DECKLET_BIN}/build ${DECK_PATH} < /dev/null
```

The `< /dev/null` on build is required — Marp hangs on inherited stdin when
called from a background context.

If build exits non-zero or `deck.html` does not exist, surface the full error
verbatim. Do not call `open`.

On success:

```bash
open ${DECK_PATH}/deck.html
```

---

## Step 8 — Offer to publish

After a successful build, ask:

> "Deck opened. Publish to get a share URL? [y/N]"

If yes:

```bash
${DECKLET_BIN}/publish ${DECK_PATH}
```

The publish script reads/writes `deck.yml` (slug + owner_key) automatically.
On success it prints the URL — relay it to the user verbatim.

---

## Completion message

> "Walk deck ready — {N} slides ({title}, intent, {X} changes, {Y} comprehension, judgment)."
>
> If published: "Share URL: {url}"

---

## Edge cases

| Situation                          | Behavior                                                                                      |
| ---------------------------------- | --------------------------------------------------------------------------------------------- |
| Only `intent.md` exists            | Generate title + intent only; warn + prompt for missing phases                                |
| `diff_excerpt` in slide body       | Bug — must be inside `<!-- ... -->` only                                                      |
| `pr_url` absent                    | Omit link; never reconstruct from org/repo                                                    |
| `outcome` absent                   | Show "in-progress"                                                                            |
| `flags[]` empty                    | Show "0 findings"                                                                             |
| Some answers missing               | Show "Not yet answered" per slide                                                             |
| Decklet not found                  | Stop at Step 0                                                                                |
| Build fails                        | Surface error verbatim; do not open                                                           |
| Deck already exists at `DECK_PATH` | `bin/new` will error — ask user if they want to overwrite (`rm -rf ${DECK_PATH}` then re-run) |
