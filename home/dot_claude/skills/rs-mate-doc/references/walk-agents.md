# Walk agents

The six analysis agents behind `mate-doc walk`. Each one writes one JSON file into the inputs dir.
The JSON shapes are in `walk.md`; this file is the task and the writing rules. Give each agent its
section of this file, the path to `walk.md`, and only the inputs its row allows.

| #   | Agent               | Reads                                                  | Writes              |
| --- | ------------------- | ------------------------------------------------------ | ------------------- |
| 1   | Story + reading map | `meta.json`, `body.txt`, `files.txt`, `diff.patch`     | `story.json`        |
| 2   | Questions           | same as 1                                              | `questions.json`    |
| 3   | Risk                | same as 1                                              | `risks.json`        |
| 4   | Judgment            | same as 1                                              | `judgment.json`     |
| 5   | Ticket fit          | the ticket, plus the same as 1                         | `ticket-fit.json`   |
| 6   | Comment triage      | `comments.json` only                                   | `comment-triage.json` |

Run 1 to 4 always, 5 only when the PR links a ticket you could fetch, 6 only when there are comments.

**Isolation.** Agents 1 to 4 never see `comments.json` or the ticket. The judgment has to be an
independent read of the diff, not one primed by what reviewers argued about or what the ticket
promised. Agents 5 and 6 don't feed 1 to 4, and 1 to 4 don't feed them.

**Every agent:** no em-dashes in any JSON string (`mate-doc lint` rejects them). In prose fields,
`**double asterisks**` around one or two key phrases render bold; any other markup renders as text.

## Agent 1: Story + reading map

Tell the story of this PR and decide the reading order, as a senior engineer briefing a teammate
before review. Write in the author's voice: what problem forced this change, what they decided,
what was hard. No file inventories.

This is explanation, not reference. Two things separate a story that explains from one that
narrates:

- **Weigh the alternative.** If there was an obvious other way (patch the one call site vs guard
  the whole layer), say what it was and why it lost. Don't invent one for a mechanical change.
- **Place it in context.** Where does this sit relative to what comes next: a follow-up ticket, a
  migration, a deprecation?

Rules:

- `story`: up to 3 beats, 30 words max each, one beat per idea.
- 2 to 5 groups. Group by decision, not by directory. Order by dependency: what you need to
  understand first goes first.
- `lead` on a group carries the reading direction ("Read this first", "Skim last"). It is never a
  claim.
- `framing` is one factual sentence a reader could be wrong about, and it becomes a claim. Back it
  with one `anchor`: a line copied exactly from `diff.patch` (an added or removed line, without the
  leading `+`/`-`), from a file in that group. Pick the line that proves the sentence, not the
  first line of the file.
- `note` only for something non-obvious. Omit it otherwise.

## Agent 2: Questions

2 or 3 things the reviewer must confirm while reading the diff, each with a location.

- Questions only the code can answer. Not "why did they do X": the story covers that.
- `pointer` names a real file from `files.txt`, plus a function or line.
- Anything the PR description calls pending QA or unconfirmed is always a question.

## Agent 3: Risk

What could break silently or be hard to reverse. One entry per real risk, 4 at most.

- Unverified assumptions, hardcoded strings that must match an external system, and missing tests
  for an edge case are always risks.
- Return `[]` only if there are genuinely none.

## Agent 4: Judgment

An honest verdict, sealed on the page until the reader picks their own. A calibration check, not a
spoiler.

- `fit` takes a position: "X is better than Y, because Z", against the alternative the PR did not
  take. "This looks like a reasonable approach" takes no position.
- Banned: reasonable, seems, appears, generally, somewhat, could potentially. If you are unsure,
  say what is unsure and why in one sentence.
- `overall` is one of strong, solid, cautious, concern.

## Agent 5: Ticket fit

Two separate judgments: how well the PR meets the ticket, and how well the ticket was written.

- `ticket_quality` grades the ticket on its own. A thin ticket that gets satisfied is still thin.
- `criterion` is the ticket's own text, copied word for word. Findings go in `evidence`.
- For each `Met` row, add one `ref`: a line copied exactly from `diff.patch` that backs it. Leave
  `refs` off a row the diff cannot back (an absence, a process step).
- No acceptance criteria on the ticket: `acceptance_criteria` is `[]` and the score is at most
  `thin`. An unambiguous "expected behavior" paragraph may yield one or two derived criteria; say
  so in the notes and still cap at `thin`.
- `Unplanned Deviation` flags scope the ticket never mentioned. Flag it, don't judge it.

## Agent 6: Comment triage

Classify who said what, for later reference. This is classification, not review: never judge
whether a concern is valid or addressed.

- `author_kind: bot` for structural bots (`github-actions`, org review bots, `dependabot`), or a
  login with no association plus a machine-generated footer.
- Skip a review only when it is `COMMENTED` with an empty body. An empty `APPROVED`,
  `CHANGES_REQUESTED` or `DISMISSED` still counts: summarize the state.
- `human_authenticity` only on human rows: `genuine` by default, `bot-posing-as-human` when a
  generation footer sits under a human login, `uncertain` rather than guessing.
- `resolved: true` only when the thread itself shows it (an approval, a reply confirming a fix).
