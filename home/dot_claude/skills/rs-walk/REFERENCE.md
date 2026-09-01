# rs-walk reference — rare paths

Content SKILL.md points to but doesn't need inline every run: first-run index seeding, the
standalone-mode (no `artifacts.json`) index update, and the closing learning-entry template.

## Index Seeding (first-run only, `ARTIFACT_MODE=standalone` only)

Skip this entirely when `ARTIFACT_MODE=json` — the unified `wiki/artifact/index.html` already
exists and renders `type: "walk"` entries.

When `~/brain/wiki/walks/index.html` does not exist:

1. Read `${SKILL_ROOT}/assets/index-template.html` — rs-walk's own, already carrying the table
   shell, theme toggle, and `<!-- MAIN_CSS -->` slot
2. Replace `<!-- TITLE -->` (all occurrences) with `PR Walk Index`
3. Replace `<!-- DATE -->` occurrences with today's date
4. Replace `<!-- MAIN_CSS -->` with `<style>` + the contents of `${SKILL_ROOT}/assets/walk.css`,
   and `<!-- GENERATOR -->` with the same `<meta name="generator">` stamp `build-walk.py` emits
5. Leave `<!-- CONTENT -->` in place — it is where each run inserts its `<tr>`

Row shape, one per walk (`close-walk.sh` patches the verdict cell by `id="walk-pr-{number}"`):

```html
<tr id="walk-pr-{number}">
  <td class="pr"><a href="pr-{number}-{slug}/walk.html">#{number}</a></td>
  <td><a href="pr-{number}-{slug}/walk.html">{title}</a></td>
  <td>{author}</td>
  <td class="date">{date}</td>
  <td>{tags}</td>
  <td class="walk-verdict"><span class="badge badge-ghost">pending</span></td>
</tr>
```

6. Write to `~/brain/wiki/walks/index.html`
7. Lint it: `node "${SKILL_BIN}/lint-walk.mjs" ~/brain/wiki/walks/index.html`
8. Commit: `git -C ~/brain add wiki/walks/ && git -C ~/brain commit -m "chore: init walks index"`

## Standalone-mode index update (Step 6, `ARTIFACT_MODE=standalone` only)

Read `~/brain/wiki/walks/index.html`. Find `<!-- walks: one <tr> per review -->`. Insert before it:

```html
<tr>
  <td style="font-family:var(--mate-font-mono);font-size:14px;">
    <a href="pr-{number}-{slug}/walk.html" style="color:var(--mate-primary);"
      >#{number}</a
    >
  </td>
  <td style="color:var(--mate-frame-text);font-size:14px;">{title}</td>
  <td style="color:var(--mate-frame-muted);font-size:14px;">{author.login}</td>
  <td
    style="font-family:var(--mate-font-mono);font-size:14px;color:var(--mate-frame-muted);"
  >
    {today}
  </td>
  <td>
    {for each tag:
    <span class="badge" style="margin-right:4px;font-size:11px;">{tag}</span>}
  </td>
  <td><span class="badge badge-open">pending</span></td>
</tr>
```

## Learning-entry template (Step 7, "close the loop")

Write to `~/brain/wiki/learning/walk-pr-{number}-{slug}.md`:

```markdown
---
title: "Walk: {title}"
type: learning
summary: "{1-sentence: what this PR was and what the key decision was}"
tags: { tags from meta.json }
sources: ["{PR_URL}"]
created: { today }
updated: { today }
---

## What

{story from Agent 1}

## Key decision

{group[0].note or first group framing — the most important thing}

## Risks going in

{risks_summary from Agent 4}

## Verdict

{verdict} — {your_notes if non-empty, else "no notes recorded"}
```
