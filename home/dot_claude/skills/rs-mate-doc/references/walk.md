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
      "lead": "Optional short lead.",
      "framing": "One factual sentence about what these files change. It becomes a claim.",
      "files": ["src/shared/AppWrapper.tsx"],
      "note": "Optional reviewer note."
    }
  ]
}
```

Each group's `framing` becomes a claim. When a file in the group has a hunk in the diff, the composer turns it into a verified code claim with an excerpt from the diff; otherwise it is not_verified with the PR author as owner. So write `framing` as a plain factual statement about the change, not an opinion.

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

- `ticket-fit.json`: `{ "ticket_key", "ticket_quality": { "score": "good|adequate|thin|missing", "notes" }, "acceptance_criteria": [{ "criterion", "status": "Met|Partially Met|Not Met|Unplanned Deviation", "evidence" }], "scope_delta" }`
- `comment-triage.json`: `[{ "author", "author_kind": "bot|human", "human_authenticity": "genuine|bot-posing-as-human|uncertain", "summary", "resolved" }]`
- `context.json`: `{ "mode": "qmd|grep", "items": [...] }`. Each item is either a bare string or `{ "path", "score", "snippet" }`. Renders as a "Related notes" section, one wikilink per item built from the note's file name only (no folder, no extension), plus its snippet when present.

## Output

`--out <walk-dir>` gets `index.md` and `claims.yaml`. Run `mate-doc lint` on it, then `mate-doc open` it for Robson.
