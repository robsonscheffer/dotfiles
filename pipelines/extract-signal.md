You are extracting durable lessons from code review findings. Your job is to
classify each finding and route it to the right store — pitfall files for AI
reviewers, or brain articles for domain knowledge.

## Findings

{{stageOutput "findings"}}

## Classification

For each finding, answer three questions in order. If any answer is "no", skip
that finding.

1. **Real bug or style preference?**
   - IS a bug: runtime errors, logic errors, data integrity, silent wrong
     behavior, missing auth, type safety gaps, test gaps, query correctness,
     security issues.
   - NOT a bug: style preference, performance suggestion, alternative approach,
     scope expansion, formatting, refactoring suggestion.
   - Skip style preferences.

2. **Generalizable pattern?**
   - Would this catch bugs in OTHER codebases or future code?
   - Skip one-offs (typos, copy-paste of a specific variable name, etc.).

3. **Route: about the world, or about how AI works?**
   - **AI pitfall** — the finding reflects something an AI reviewer or
     implementer would miss again (wrong API usage, template gotcha,
     framework-specific trap). Route to pitfalls.
   - **Domain learning** — the finding teaches something about the business
     domain, architecture, or system behavior. Route to brain.
   - A finding can go to both if it fits both.

## Detecting the repo slug

If the `repo` param was provided, use it. Otherwise, detect from git:

```bash
basename "$(git remote get-url origin 2>/dev/null)" .git 2>/dev/null || echo "unknown"
```

## Writing pitfalls

Pitfalls go in `~/.mate/pitfalls/{repo}.md`. One file per repo.

Before writing, read the existing file (if any) and check for duplicates.
A duplicate is a pitfall whose `rule` covers the same scenario — don't add it
again.

Append each new pitfall in this format:

```markdown
## {slug}

- domain: {comma-separated domain keywords}
- files: {comma-separated file name fragments that trigger this rule}
- rule: {one-line description of what to check}
- bad: `{minimal bad code example}`
- good: `{minimal good code example}`
- learned: {today's date, YYYY-MM-DD}
- source: {topic}
```

The slug should be a short kebab-case identifier (e.g., `missing-nil-check`,
`wrong-join-direction`).

## Writing brain articles

Brain articles go in `~/brain/wiki/learning/{slug}.md`.

Before writing, search for existing articles on the same topic:

```bash
grep -rl "{key phrase}" ~/brain/wiki/learning/ 2>/dev/null
```

Skip if a substantially similar article exists.

Each article uses this format:

```markdown
---
title: { descriptive title }
type: learning
summary: { one-line summary }
tags: [{ relevant, tags }]
curated: false
created: { today's date, YYYY-MM-DD }
updated: { today's date, YYYY-MM-DD }
---

# {title}

{What happened: describe the bug or pattern in concrete terms.}

{Why it matters: what breaks, what's the blast radius.}

{What to do instead: the fix or prevention strategy.}
```

The filename slug should be kebab-case, descriptive, and unique.

## Committing

After writing all pitfalls and articles, commit the changes:

```bash
git add ~/.mate/pitfalls/ ~/brain/wiki/learning/
git commit -m "chore: extract learning from {{.Param.topic}}"
```

Stage only the files you created or modified. Do not stage unrelated changes.

## Output

Summarize what you extracted:

- **Skipped:** N findings (with brief reason per skip)
- **Pitfalls written:** list of slugs added to `{repo}.md`
- **Articles written:** list of slugs added to `wiki/learning/`
- **Already existed:** list of duplicates found
