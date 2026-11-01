# Sources

What `scripts/collect.sh` reads, and why each one is worth reading. Paths use the env defaults
(`BRAIN=~/brain`, `APPS=~/apps`).

| Source | Path | Item | Why it is useful |
|---|---|---|---|
| Session reports | `$BRAIN/obah/sessions/INDEX.md` | one table row: date, title, summary | A person-written line per work session, already summarised |
| Reports | `$BRAIN/wiki/artifact/report/YYYY-MM-DD-*/` | folder date and the page `<title>` | Finished research, usually with numbers and sources |
| Handoffs | `$BRAIN/.scratch/handoffs/<project>/YYYY-MM-DD-*.md` | `topic` and `next` from the frontmatter | Work in progress; good for "what I am building now" |
| Commits | every git repo at `$APPS/<owner>/<repo>` | one commit subject | Shipped changes; public repos can show the real diff |
| Voice | `openwhispr --local transcriptions list --format json` | one transcription | Ideas outside work; the only voice source |

Not read, on purpose:

- Claude Code transcripts (`~/.claude/projects`): private and noisy. `rs-session-audit` reads them
  for a different job.
- Worktrees (`*-wt-*`): they repeat their main repo's commits.
- Photos: no source yet.

The window is the last N days by the item's date (default 7). Dates come from the row, the folder
or file name, the commit date, or the transcription's `created_at`.
