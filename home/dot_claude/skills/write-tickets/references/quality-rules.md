# Quality Rules

Universal rendering invariants. Apply to every ticket regardless of mode, profile, or template.

## Links

- **No local file paths.** Always use GitHub links: `[file.rb#L45](<repo-url>/blob/main/path/file.rb#L45)`. Never write `/Users/...` or relative paths without a link.
- **Repository URL:** Detect dynamically from `git remote get-url origin`. Never hardcode a repository URL. Normalize the URL before using it: strip any trailing `.git` suffix, and convert SSH format (`git@github.com:org/repo.git`) to HTTPS (`https://github.com/org/repo`).
- **Link at first mention.** Don't re-link the same item later in the ticket.
- **Preserve source links automatically.** If the user provides actual URLs (Google Docs, Slack threads, Confluence pages), include them in the relevant ticket. Don't ask — just do it. Only preserve actual URLs; no vague references like "Slack conversation with X" without a link.

## Structure

- **Use ONLY template sections.** No "Dependencies", "Scope Boundaries", "In Scope", "Open Questions", "Data Model", "Implementation Steps", "Files to Create", or "Success Metrics".
- **No "Open Questions" in the ticket.** Ask questions BEFORE generating the ticket. Tickets are actionable, not lists of things to figure out.
- **Sections are a menu, not a checklist.** Omit any section where the content would be empty, redundant, or filler. Profiles control how aggressively this applies.

## Tech Specs

- **3-5 bullet points max.** Entry points and gotchas, not every file.
- **No exhaustive file lists.** No "Files to Create" or "Files to Modify" sections.
- **No code examples or class structures.** Bullet points with links, not code blocks.
- **No step-by-step implementation instructions.** Trust the implementer.

## Content

- **Verified findings only.** No "likely" or "probably." Only include what you confirmed exists.
- **Output format:** Always Markdown. Works for both JIRA API and manual paste.
