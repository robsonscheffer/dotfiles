# Decision record template

Path: `<records_dir>/decision-<name>.md`. Add any frontmatter your notes need (title, summary, type,
tags) next to the flow fields.

```markdown
---
title: "<name>: prototype"
summary: "<one sentence: what it is and where it stands>"
type: decision
tags: [prototype, <area>]
status: prototype            # prototype | parked | stopped | invested
repo: https://github.com/<prototype.repo_owner>/<name>
started: YYYY-MM-DD
decision_date: YYYY-MM-DD    # at most decision_weeks after started
parked:                      # date, when parked
resume_when:                 # when parked: what would make it worth time again
work:                        # when invested: the link to the new work item
restart_repo:                # when invested: from invest.repo_pattern
---

# <name>: <the answer in one line: what it is and its status>

| Line | Value |
|------|-------|
| What | one sentence |
| Return | learning, visibility or revenue |
| Bet | time budget; decision date; what would make it worth investing |
| Not now | what stays out until the decision |
| Signals | what to watch: posts, users, a payer |

## Log

- YYYY-MM-DD: intake.

## Left open

(filled when parked: the open items folded in from handoffs)
```
