---
name: html-artifact
description: >
  Generate, organize, promote, and publish HTML artifacts.
  Provides a consistent design system (mate DS) across all generated pages.
  Manages two-tier storage: ephemeral scratch and promoted wiki.
  Handles first-run setup automatically.
triggers:
  - /html-artifact
  - /artifact
requires:
  tools: [node]
  plugins: [html-publisher]
---

# html-artifact

Generate polished HTML artifacts using the mate design system. Manage them in
two tiers (scratch / wiki), promote when ready, publish to a live URL with
one command.

## When to invoke

- User asks to create an HTML report, spec, prototype, or dashboard
- User says `/artifact new`, `/html-artifact`, or "create an artifact"
- User says "promote artifact", "publish artifact", or "serve artifacts"

---

## Generating an artifact

1. Choose the template type for the content:
   - **spec** — design spec, requirements, or architecture doc
   - **report** — findings, audit results, data analysis
   - **prototype** — interactive UI demo
   - **dashboard** — metrics and data tables

2. Read the pre-built template:
   - `~/.claude/skills/html-artifact/dist/templates/spec.html`
   - `~/.claude/skills/html-artifact/dist/templates/report.html`
   - `~/.claude/skills/html-artifact/dist/templates/prototype.html`
   - `~/.claude/skills/html-artifact/dist/templates/dashboard.html`

3. Link the stylesheet. Every generated artifact must have this in `<head>`:

   ```html
   <link rel="stylesheet" href="http://localhost:52010/style/main.css" />
   ```

   The persistent server (started via LaunchAgent) serves the compiled CSS at this URL.
   **Never use a `file://` path and never inline the CSS as a `<style>` block.**

4. Fill the content slots:
   - `<!-- TITLE -->` — artifact title (appears in `<title>`, breadcrumb, and h1)
   - `<!-- DATE -->` — date in `YYYY-MM-DD` format
   - `<!-- CONTENT -->` comment — replace with your HTML content
   - `<!-- ADDITIONAL META BADGES -->` — optional: add `<span class="badge ...">` for status chips
   - `<!-- FOOTER LINK -->` — optional: add a link to the live URL if published

5. Write the filled template to the output path.

6. Run the linter and fix every violation before reporting done:
   ```bash
   node ~/.claude/skills/html-artifact/bin/lint-artifact.mjs <output-path>
   ```
   Exit 0 = clean. Exit 1 = violations printed with file:line context — fix each one.

---

## Design System

Artifacts use DaisyUI v5 + Tailwind v4 as the base layer, with the mate theme applied via
`data-theme="mate"` on `<html>`. Use DaisyUI class names directly — no custom utilities
needed for base components. The mate theme overrides DaisyUI's default palette via CSS custom
properties and oklch color definitions declared in the `<style>` block.

### Token vocabulary

These CSS custom properties are defined in every artifact's `<style>` block. Use them — never
invent raw hex values.

| Token                  | Value              | Usage                                                                   |
| ---------------------- | ------------------ | ----------------------------------------------------------------------- |
| `--mate-primary`       | `#d4764e`          | Brand, CTAs, active states                                              |
| `--mate-secondary`     | `#c4956a`          | Secondary accents                                                       |
| `--mate-success`       | `#7db46e`          | Success, done states                                                    |
| `--mate-warning`       | `#e8b84a`          | Warning, in-progress                                                    |
| `--mate-error`         | `#e05252`          | Error, destructive                                                      |
| `--mate-info`          | `#6b9fb4`          | Info, minor severity                                                    |
| `--mate-frame-bg`      | `#18150f`          | Page background                                                         |
| `--mate-frame-sidebar` | `#201c15`          | Sidebar background                                                      |
| `--mate-frame-nav`     | `#1c1810`          | Top nav background                                                      |
| `--mate-frame-text`    | `#e8e0d4`          | All body copy and descriptive text                                      |
| `--mate-frame-muted`   | `#a0927e`          | **Labels, captions, rail labels, table headers only** — never body copy |
| `--mate-frame-dim`     | `#857363`          | Tertiary: timestamps, footer, placeholder text                          |
| `--mate-font-display`  | Cormorant Garamond | Headings, stat values                                                   |
| `--mate-font-body`     | Jost               | UI text, labels                                                         |
| `--mate-font-mono`     | DM Mono            | Code, hex values, numbers                                               |

### Token usage rules (hard constraints)

These are the most common mistakes. Treat them as invariants, not guidelines.

| Rule                                 | Wrong                           | Right                             |
| ------------------------------------ | ------------------------------- | --------------------------------- |
| Body/paragraph text                  | `color:var(--mate-frame-muted)` | `color:var(--mate-frame-text)`    |
| Rollout step descriptions            | `color:var(--mate-frame-muted)` | `color:var(--mate-frame-text)`    |
| Table cell content                   | `color:var(--mate-frame-muted)` | `color:var(--mate-frame-text)`    |
| Table column headers                 | `color:var(--mate-frame-text)`  | `color:var(--mate-frame-muted)`   |
| Rail label (the small uppercase key) | `color:var(--mate-frame-text)`  | `color:var(--mate-frame-muted)`   |
| Rail value (the actual value)        | `color:var(--mate-frame-muted)` | `color:var(--mate-frame-text)`    |
| Body font size                       | `font-size:12px` or `13px`      | `font-size:14px` or `15px`        |
| Light-mode hex in dark theme         | `background:#fef2f2`            | `background:rgba(212,36,21,0.07)` |

**The rule of thumb:** if a human would read it as content, it gets `--mate-frame-text`. If it is a label _above_ or _beside_ content (never the content itself), it may use `--mate-frame-muted`.

### DaisyUI components (use directly — no special setup)

navbar, breadcrumbs, btn (all variants), input, select, textarea, label, form-control,
alert (all variants), progress, stats/stat, badge, tooltip, card, table, footer

### Custom registry components

These are not in DaisyUI. Use the class names exactly as listed — they are compiled into
`dist/style/main.css` and available in every artifact via the external stylesheet link.

| Component       | Classes                                                                                                                         | When to use                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Severity chip   | `.sev .sev-critical` `.sev-major` `.sev-minor` `.sev-nit`                                                                       | Code review finding severity             |
| Lifecycle badge | `.badge .badge-open` `.badge-ready` `.badge-building` `.badge-done` `.badge-dropped`                                            | Ticket/artifact lifecycle state          |
| Stat delta      | `.stat-delta .delta-up` / `.delta-down`                                                                                         | Trend indicator below a stat value       |
| Code diff       | `.diff-block` `.diff-file-header` `.diff-hunk-header` `.diff-line` `.diff-line.added` `.diff-line.removed` `.diff-line.context` | Unified diff viewer                      |
| Spec rail       | `.spec-layout` `.spec-rail` `.spec-rail-row` `.spec-rail-label` `.spec-rail-value`                                              | Right metadata panel in spec docs        |
| Spec decision   | `.spec-decision`                                                                                                                | Left-border callout for design decisions |
| Palette swatch  | `.swatch-grid` `.swatch-card` `.swatch-color` `.swatch-meta` `.swatch-name` `.swatch-hex`                                       | Color documentation                      |

See `~/.claude/skills/html-artifact/dist/showcase.html` for the full live reference.

### Agent extension rule

When a new component is needed that isn't in DaisyUI or the registry, compose it from
`var(--mate-*)` tokens. Name classes with the `.mate-` prefix. Do not invent new colors —
use tokens only.

---

## Operations

Read `~/.config/html-artifact.json` at the start of every operation.
If the file does not exist, run the **First-Run Wizard** before proceeding.

### new

1. `AskUserQuestion`: "Scratch (ephemeral) or wiki (committed)?" → `scratch` / `wiki`
2. `AskUserQuestion`: "Type?" → `spec` / `report` / `prototype` / `dashboard`
3. Derive a slug from the user's topic (kebab-case, max 40 chars, date-prefixed: `2026-06-09-<slug>`).
4. Generate the HTML file using a pre-built template from `~/.claude/skills/html-artifact/dist/templates/<type>.html`. Follow the **Generating an artifact** section above.
5. Write to `<base_dir>/wiki/artifact/<type>/<slug>.html` (wiki) or `<base_dir>/.scratch/artifact/<type>/<slug>.html` (scratch).
6. If tier is `wiki`: update `wiki/artifact/index.html` (see **index.html** below). Commit: `git -C <base_dir> add wiki/artifact/ && git -C <base_dir> commit -m "chore: add artifact <slug>"`.
7. If tier is `scratch`: write file only. No index update, no commit.

### promote

1. Ask user which scratch artifact to promote (show list from `.scratch/artifact/`).
2. `mv <base_dir>/.scratch/artifact/<type>/<file>.html <base_dir>/wiki/artifact/<type>/`
3. If `<file>.html.pub.json` exists alongside it (e.g. `2026-06-09-my-report.html.pub.json`), move the sidecar too.
4. Update `wiki/artifact/index.html` to add the promoted artifact.
5. Commit: `git -C <base_dir> add wiki/artifact/ && git -C <base_dir> commit -m "chore: promote artifact <slug>"`.

### publish

1. Determine source path.
2. Check for `<source>.pub.json` sidecar.
   - If sidecar exists: call html-publisher with `--slug <slug> --owner-key <key>` (update).
   - If not: call html-publisher for new page.
3. Call html-publisher:
   ```bash
   RESULT=$(${PLUGIN_ROOT:html-publisher}/bin/publish share-html \
     --source <path.html> \
     [--slug <slug> --owner-key <key>])
   ```
4. Parse JSON result. Check `ok`. If false, surface `error` to user and stop.
5. Write/update sidecar `<source>.html.pub.json` (e.g. `2026-06-09-my-report.html.pub.json`):
   ```json
   {
     "slug": "...",
     "owner_key": "...",
     "url": "...",
     "manage_url": "...",
     "published_at": "..."
   }
   ```
6. Update `index.html`: if no `<tr>` exists for this artifact yet (e.g. publishing from scratch before promoting), add a new row. Otherwise find the `<tr>` whose `<a href>` matches the artifact's relative path (e.g. `report/2026-06-09-my-report.html`) and update its Published `<td>` with `<a href="[url]">share ↗</a>`.
7. Surface both `url` (share) and `manage_url` (author) to the user.

### serve

```bash
node ~/.claude/skills/html-artifact/bin/artifact-serve.mjs
```

Opens `wiki/artifact/index.html` in the browser via a local static server.

---

## First-Run Wizard

Triggers when `~/.config/html-artifact.json` is missing.

1. `AskUserQuestion`: "Where should artifacts live? (default: ~/brain)"
   → store as `base_dir`
2. `AskUserQuestion`: "Where should shared assets live? (default: <base_dir>/assets)"
   → store as `assets_dir`
3. Create `~/.config/` if needed, then write `~/.config/html-artifact.json`:
   ```json
   { "base_dir": "<answer1>", "assets_dir": "<answer2>" }
   ```
4. Create directories:
   ```
   <base_dir>/wiki/artifact/spec/
   <base_dir>/wiki/artifact/report/
   <base_dir>/wiki/artifact/prototype/
   <base_dir>/wiki/artifact/dashboard/
   <base_dir>/.scratch/artifact/spec/
   <base_dir>/.scratch/artifact/report/
   <base_dir>/.scratch/artifact/prototype/
   <base_dir>/.scratch/artifact/dashboard/
   <assets_dir>/
   ```
5. Write empty `wiki/artifact/index.html` (see **index.html** below, with empty tbody).
6. Proceed with the original operation.

---

## index.html

The manifest file at `wiki/artifact/index.html`. Claude maintains this — update on every `new` (wiki), `promote`, and `publish` operation.

Use the `dashboard` pre-built template from `dist/templates/dashboard.html` as the base. Fill
`<!-- TITLE -->` with `Artifact Index`, then replace `<!-- CONTENT -->` with:

```html
<table class="table w-full">
  <thead>
    <tr>
      <th
        style="color:var(--mate-frame-muted);font-family:var(--mate-font-body);"
      >
        Title
      </th>
      <th
        style="color:var(--mate-frame-muted);font-family:var(--mate-font-body);"
      >
        Type
      </th>
      <th
        style="color:var(--mate-frame-muted);font-family:var(--mate-font-body);"
      >
        Date
      </th>
      <th
        style="color:var(--mate-frame-muted);font-family:var(--mate-font-body);"
      >
        Published
      </th>
    </tr>
  </thead>
  <tbody>
    <!-- one <tr> per artifact — added by Claude on new/promote/publish -->
    <!-- example row:
    <tr>
      <td><a href="report/2026-06-09-my-report.html" style="color:var(--mate-primary);">My Report</a></td>
      <td><span class="badge badge-done">report</span></td>
      <td style="font-family:var(--mate-font-mono);font-size:13px;color:var(--mate-frame-muted);">2026-06-09</td>
      <td><a href="https://share.html.com/abc123" style="color:var(--mate-primary);">share ↗</a></td>
    </tr>
    -->
  </tbody>
</table>
```
