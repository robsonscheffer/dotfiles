---
description: Use when asked to "write a PR description", "PR description", or "describe this PR". Generates a formatted JIRA block from branch changes. Does NOT create the PR itself — use create-pr for that.
---

# Write PR Description

Generate a formatted PR description block from branch changes.

## When to Use

- "write a PR description" / "PR description"
- "describe this PR" / "describe changes"

**This skill ONLY generates the description text. To create or update a PR, use `/create-pr`.**

## Workflow

1. **Gather changes**

If it looks like the user is using the Jujutsu source control tool then instead of the git commands use.

```bash
  jj status # Find the bookmark(branch) which is usually found just before the | on the line starting with Working copy
  jj diff -r '(ancestors(@) | descendants(@)) ~ immutable()' # changes from mainline
```

You can tell if somebody is using jujutsu by running `which jj` if an executable is found and running `jj root` does not return an error they are using jj. The default should be to use the git commands below.

```bash
git diff origin/main...HEAD      # committed changes on branch
git diff --cached                # staged changes
```

2. **Extract JIRA ticket**
   - Parse branch name for pattern `[A-Z]+-\d+` (e.g., PROJ-12345)
   - If not found: ask user "What's the JIRA ticket? (or 'skip' for placeholder)"
   - If skip: use `PROJ-xxxx`
   - **Link format:**
     - If branch starts with `PROJ`: use `https://yourcompany.atlassian.net/browse/TICKET`
     - Otherwise: use `https://yourcompany.atlassian.net/browse/TICKET`

3. **Analyze changes** - understand what changed, why, and who it impacts

4. **Output the description** in a code fence so it's copyable:

```
[[[
**jira:** [TICKET-123](https://yourcompany.atlassian.net/browse/TICKET-123)
**what:** concise summary of changes
**why:** business justification
**who:** affected users/teams
]]]

## Details

Implementation details go here.
```

5. **Ask about clipboard** — use `AskUserQuestion` with Yes/No options to ask "Copy to clipboard?". If yes, pipe the full output (the `[[[...]]]` block and `## Details` section) to `pbcopy`.

## Output Rules

**The `[[[...]]]` block appears in changelog summaries.** Write "what" as a changelog entry — what changed at a high level, not how it was implemented.

**DO:**

- Don't add any indentation to any of the text within the `[[[...]]]` block
- Put `[[[` on its own line before the first content line
- Put `]]]` on its own line after the last content line
- Keep what/why/who concise — each should be a single short line, not a paragraph
- Use backticks for code references (class names, methods, files, etc.)
- If there are multiple distinct changes, use short bullet points (max ~10 words each)
- Always put implementation details in a `## Details` section AFTER the `[[[...]]]` block

**DO NOT:**

- Add agent preamble or headers
- Put implementation details (class names, patterns, architectural decisions) inside the `[[[...]]]` block — those go in `## Details`
- Use bullet points that describe _how_ something was built — describe _what_ changed

## Examples

### Bug fix

```
[[[
**jira:** [TICKET-123](https://yourcompany.atlassian.net/browse/TICKET-123)
**what:** Fix crash when user has no address during account transfer
**why:** Missing addresses caused 500 errors in production
**who:** Users transferring accounts
]]]
```

### Feature with multiple changes

```
[[[
**jira:** [TICKET-456](https://yourcompany.atlassian.net/browse/TICKET-456)
**what:**
- Add validation error preview to admin review page
- Replace legacy billing calculator

**why:** Enable ops to catch issues before committing changes
**who:** Internal ops team
]]]
```

### Cleanup / internal

```
[[[
**jira:** [TICKET-789](https://yourcompany.atlassian.net/browse/TICKET-789)
**what:** Remove dead code after feature flag rollout
**why:** Unreachable after full rollout
**who:** No user impact
]]]
```

### BAD — too verbose (don't do this)

```
[[[
**what:**
- Add `FooSerializer` with fetchable `validation_errors` and `validation_error_count` fields that preview errors after syncing staged data to the model (no DB writes)
- Extract `BarTransformer` to handle flat settings into nested structures (field_a, field_b grouping), reused by both the serializer and the existing Sync action
- Add CODEOWNERS entries for `foo*` paths under my-team
]]]
```

This reads like a design doc. Rewrite as:

```
[[[
**what:** Add validation error preview to admin review page
]]]
```

Implementation details (new classes, extraction, CODEOWNERS) go in `## Details` outside the block.

## Edge Cases

| Situation                 | Action                                                 |
| ------------------------- | ------------------------------------------------------ |
| No JIRA in branch         | Ask user, allow "skip" for placeholder                 |
| No changes found          | Warn: "No staged or committed changes found"           |
| Large diff (100+ files)   | Summarize at directory/subsystem level                 |
| Base branch not main      | Ask user for base branch                               |
| Branch starts with PROJ   | Use Atlassian link: `yourcompany.atlassian.net/browse/...` |
