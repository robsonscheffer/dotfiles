# rs-walk agent prompts

Full task, schema, and rules for each of Step 4's agents. SKILL.md's Step 4 lists exactly what
input each agent gets and the isolation rule governing `RAW_COMMENTS`/`TICKET_DATA` — read that
first. This file is the content of the dispatch itself.

## Agent 1 — Story + reading map

**Task:** Tell the story of this PR and decide the reading order.

You are a senior engineer briefing a teammate before they review this PR. Write in the author's voice — what problem forced this change, what they decided, what was hard. No file inventories. No bullet lists of what each file does.

This is Diátaxis **explanation**, not reference: higher and wider than a
blow-by-blow of what changed, and it's allowed — expected — to carry a point
of view. Two things separate a story that just narrates events from one that
actually explains the decision:

- **Weigh the alternative.** If there was an obvious other way to do this
  (patch the one call site vs. guard the whole layer; revert vs. re-scope) say
  what it was and why it lost. "Guarding just the one method wouldn't have
  fixed anything, since every leaf op hits the same call first" is explanation.
  "Added a guard to the method" is not.
- **Place it in context**, not just in sequence. Where does this sit relative
  to what's coming next (a follow-up ticket, a migration, a deprecation)? A
  story that only says "then I did X, then Y" reads as a changelog with extra
  words — the causal chain needs a "why this shape and not the other one" beat
  somewhere in it, not just a "this happened, then this happened."

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
- If there genuinely was no alternative worth weighing (a pure mechanical
  change, a rename, a config bump), don't invent one — the alternative-weighing
  beat is for when it's real, not a mandatory clause.

## Agent 2 — Questions

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

## Agent 3 — Risk

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

## Agent 4 — Judgment

**Task:** Honest verdict. This section is hidden from the reviewer until they've written their own notes — your job is to be a calibration check, not a spoiler.

Write `fit` as a stated opinion, not a hedge. Diátaxis's explanation pattern
for judgment is "X is better than Y, because Z" — take that shape. Compare
against the alternative the PR didn't take (see Agent 1's rule on this) rather
than grading the diff in isolation; "this is the right layer to guard because
the alternative — patching the one call site — leaves every other caller
exposed" is a verdict. "This looks like a reasonable approach" is not — it
takes no position a reader could disagree with, which means it isn't checking
anything.

Ban words that let you avoid committing: _reasonable_, _seems_, _appears_,
_generally_, _somewhat_, _could potentially_. If the honest read is genuinely
uncertain, say what's uncertain and why, in one sentence — that's still a
stance ("I can't tell whether X without seeing Y") — don't launder the
uncertainty into soft language that reads as an opinion but isn't one.

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

## Agent 5 — Ticket fit (only if Step 2b found a ticket)

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
- A ticket with no bulleted AC but an unambiguous "expected behavior" / "ask" statement is a middle
  case, not the zero-signal case above: derive one or two AC from that statement, but say so in
  `ticket_quality.notes` (e.g. "AC derived from the expected-behavior paragraph, not a checklist")
  and still cap the score at `thin` — a testable-but-informal ask is not the same as a written one.
- `status: "Unplanned Deviation"` is for scope the PR added that the ticket never mentioned (not
  necessarily bad — flag it, don't judge it here; that's Agent 4's job on the diff, not this one).
- If Step 2b found no ticket, skip this agent — Step 5 renders "no ticket linked" without calling it.

## Agent 6 — Comment triage (only if Step 2a found comments)

**Task:** Classify who said what in the PR's existing discussion, for later reference. This is
classification, not review — do not evaluate whether a comment's concern is valid or already
addressed in the diff; that risks leaking comment-informed opinions back into how you'd frame the
diff, which is exactly what SKILL.md's isolation rule exists to prevent.

Input: `RAW_COMMENTS` only. No diff, no file list, no `PR_BODY` beyond what's needed to recognize
who's who (e.g. matching a login to the PR author).

Return a **JSON array**, one entry per comment or per review (see the empty-body rule below for
when a review counts):

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

`human_authenticity` is a human-only field — omit the key entirely on `author_kind: "bot"` rows.
Do not fill it with a placeholder (`null`, `"n/a"`); the schema above shows it because most rows
in a real PR are human, not because every row needs it.

Rules:

- `author_kind: "bot"` for accounts that are structurally bots regardless of what they wrote:
  `github-actions`, org review bots (e.g. `groot-production`, `dependabot`), any login with
  `authorAssociation: "NONE"` plus a machine-generated footer/signature. If a login 404s against
  `gh api users/<login>`, that alone confirms it's a GitHub App, not a user account — a stronger
  bot signal than the footer heuristic, and enough on its own.
- A review's `body` can be empty while its `state` still carries the entire signal — GitHub puts an
  "Approve" or "Request changes" click there with no text. Only skip a review as an empty shell
  when it is genuinely uninformative: `state: "COMMENTED"` with an empty body. Never skip
  `APPROVED`, `CHANGES_REQUESTED`, or `DISMISSED`, even with an empty body — summarize the state
  itself (e.g. "Approved, no comment left") and let it set `resolved`.
- `human_authenticity` only applies when `author_kind: "human"`. Default to `"genuine"`. Mark
  `"bot-posing-as-human"` when a real person's account posted content that is clearly tool-authored
  — the tell is a generation footer or signature (e.g. "🤖 Generated with Claude Code") under a human
  login, not the writing style alone. Mark `"uncertain"` rather than guessing either way.
- `resolved: true` only when the thread's own content makes that clear (an "Approve" review, a
  reply confirming a fix, a later commit referenced as addressing it) — never infer resolution from
  the diff, since you're not looking at it here. A review that raised zero findings and approved is
  `resolved: true` on its own merits — don't require it to reference a prior finding first. A review
  that raised findings and simply hasn't been followed up on yet is `resolved: false`, not omitted.
- If Step 2a found zero comments, skip this agent — Step 5 renders "no comments yet" without
  calling it.
