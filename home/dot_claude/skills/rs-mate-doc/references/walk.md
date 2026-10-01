# Walk inputs

`mate-doc walk <pr-url> --fetch-only --out <dir>` writes the raw PR: `meta.json`, `body.txt`, `diff.patch`, `files.txt`, `comments.json`. Read those, then write the four required JSON files into the same directory and compose with `--inputs <dir>`.

## Required

`story.json`: the author's story, and the diff in reading order.

```json
{
  "lead": "One sentence on what this PR does.",
  "story": ["Paragraph on why.", "Paragraph on how the change is shaped."],
  "groups": [
    {
      "title": "Shared layer goes store-optional",
      "lead": "Optional short lead. Reading directions go here.",
      "framing": "One factual sentence about what these files change. It becomes a claim.",
      "files": ["src/shared/AppWrapper.tsx"],
      "anchors": [{ "file": "src/shared/AppWrapper.tsx", "excerpt": "a line copied from the diff" }],
      "note": "Optional reviewer note."
    }
  ]
}
```

`framing` is optional. When present it is one factual sentence a reader could be wrong about, and it becomes a claim. Reading directions ("Read this first", "Skim last") go in the group `lead`, which is never a claim. A group with no `framing` gets no claim.

`anchors` is a list of `{ "file", "excerpt" }`. Copy a line from the diff that backs the framing; the file must be one of the group's `files`. The composer finds that line (added lines first, then removed lines) and writes a `proposed` code claim pointing at it. Only the first matching anchor backs a claim; each later anchor adds a warning. A missing anchor, or one that matches no line in the diff, makes the claim `not_verified` with the PR author as owner, and `mate-doc walk` prints a warning. The composer never picks a line for you and never marks a claim `verified`.

`questions.json`: what the reviewer should ask.

```json
[{ "title": "Rollback", "question": "Is reverting one commit enough?", "pointer": "src/shared/AppWrapper.tsx" }]
```

`risks.json`:

```json
[{ "title": "Redirect loop", "description": "What can break.", "blast_radius": "who is affected", "file": "src/router/navigate.ts" }]
```

`judgment.json`: hidden in a `<details>` block at the end of the walk.

```json
{ "fit": "Is this the right shape for the change?", "risks_summary": ["..."], "gaps": ["..."], "overall": "strong | solid | cautious | concern" }
```

## Optional

- `ticket-fit.json`: `{ "ticket_key", "ticket_quality": { "score": "good|adequate|thin|missing", "notes" }, "acceptance_criteria": [{ "criterion", "status": "Met|Partially Met|Not Met|Unplanned Deviation", "evidence", "refs" }], "scope_delta" }`
  - `criterion` is the ticket's own text, copied word for word. Put your findings in `evidence`; it fills the table's Evidence column and is not claim evidence.
  - `refs: [{ "file", "excerpt" }]` backs a `Met` criterion with a line copied from the diff (any file in the diff). The claim text is the criterion itself and is `proposed`. Any other status, or a `Met` with no matching ref, is `not_verified`.
  - Every criterion claim gets `role: criterion`. A verdict other than `supports` on one is a review finding: it shows on the claim marker in the table and does not fail the gate.
- `comment-triage.json`: `[{ "author", "author_kind": "bot|human", "human_authenticity": "genuine|bot-posing-as-human|uncertain", "summary", "resolved" }]`
- `context.json`: `{ "mode": "qmd|grep", "items": [...] }`. Each item is either a bare string or `{ "path", "score", "snippet" }`. Renders as a "Related notes" section, one wikilink per item built from the note's file name only (no folder, no extension), plus its snippet when present.

## Output

`--out <walk-dir>` gets `index.md` and `claims.yaml`. The ledger starts with `author:`, the actor that ran the compose, and holds only `proposed` and `not_verified` claims. Run `mate-doc lint` on it, then `mate-doc verify <walk-dir>`, which asks a fresh verifier agent about each `proposed` claim. Do not record verdicts on your own claims. Then `mate-doc open` it for the user without waiting for `mate-doc gate` to pass: a failing verdict shows on its claim marker with the reason, and a walk is read, not approved. Report the gate's one summary line with the URL, and leave any verdict the user owes for after they have read it.

## Submit

`mate-doc walk submit <walk-dir> --approve | --request-changes | --comment [--body-file F] [--notes-file N] [--yes]`
reads the PR from the walk's own frontmatter (`pr: "org/repo#123"`) and posts a review with `gh pr review`. The
body is the file at `--body-file` plus, when given, `--notes-file` - a JSON object `{ "section": "text" }`
rendered as one bullet per section and appended after the body text.

Without `--yes` this only prints what would be posted and the exact `gh` command, and posts nothing. Posting a
review is outward-facing, so always show that dry run to the user and get a yes before adding `--yes`. A `gh`
failure with `--yes` prints `gh`'s error, exits non-zero, and leaves the walk's frontmatter untouched.

## Close

`mate-doc walk close <walk-dir> --verdict approved|changes-requested|commented|skipped [--notes-file N]` writes
`verdict` and `closed: YYYY-MM-DD` into the walk's frontmatter, keeping every other key, its order, and the whole
body untouched. It then runs `walk.close_hook` from `~/.config/mate-doc/config.yaml` if set - a shell command that
gets the walk dir, PR number, repo, verdict, and notes-file path as `MATE_DOC_WALK_DIR`, `MATE_DOC_PR`,
`MATE_DOC_REPO`, `MATE_DOC_VERDICT`, `MATE_DOC_NOTES_FILE`. Example config:

```yaml
walk:
  close_hook: "~/bin/my-walk-bookkeeping.sh"
```

`mate-doc setup` sets `close_hook` to `bin/walk-close-hook` when the config has no `walk:` key. That default
commits only the walk folder when it sits in a git repo and is not ignored, then runs `qmd update` if `qmd` is
installed. Anything personal (a learning note, a log line) goes in your own hook, which never ships in this repo;
call the default from it to keep both. A failing hook prints its output and exits non-zero, but the frontmatter change stays either way. No hook
configured is not an error.
