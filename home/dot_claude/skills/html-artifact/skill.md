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

## Session start — always read these files first

Before any operation, read these three files. Never rely on values remembered
from a previous session or stated in this skill — the user may have changed
their config or the design system may have been updated.

**1. User config** — `~/.config/html-artifact.json`

Provides `base_dir`, `port` (default: `52010`), `md_roots`. If the file does
not exist, run the **First-Run Wizard** before proceeding.

**2. Design tokens** — `~/.claude/skills/html-artifact/assets/css/tokens.yaml`

Provides current token values (hex, rgba) and their intended usage. Use these
values in inline styles. Do not guess or recall hex values from memory.
Token names follow the pattern `--mate-<key>` (e.g. `palette.primary.value`
maps to `var(--mate-primary)`).

**3. Component registry** — `~/.claude/skills/html-artifact/assets/registry.yaml`

Lists all custom components by id, with their class name conventions and
descriptions. Read per-component `example.html` under
`~/.claude/skills/html-artifact/assets/components/<id>/` when you need the
exact markup pattern for a component.

---

## Storage layout and URL routing

The server maps filesystem paths to URL prefixes. **Always derive paths and
URLs from `base_dir` and `port` read from config — never hard-code them.**

| Tier    | Filesystem path                                   | Server URL                                             |
| ------- | ------------------------------------------------- | ------------------------------------------------------ |
| scratch | `<base_dir>/.scratch/artifact/<type>/<slug>.html` | `http://localhost:<port>/scratch/<type>/<slug>.html`   |
| wiki    | `<base_dir>/wiki/artifact/<type>/<slug>.html`     | `http://localhost:<port>/artifacts/<type>/<slug>.html` |
| index   | `<base_dir>/wiki/artifact/index.html`             | `http://localhost:<port>/artifacts/index.html`         |
| style   | (served from skill dist/)                         | `http://localhost:<port>/style/main.css`               |
| md view | (any file under md_roots)                         | `http://localhost:<port>/md?path=<encoded-path>`       |

`<type>` is one of: `spec`, `report`, `prototype`, `dashboard`.

The route prefixes (`/scratch/`, `/artifacts/`) are fixed conventions — they
do not change with config. Only `base_dir` and `port` vary per user.

**Never pass the filesystem path to `open` or construct a URL from `<base_dir>`**
— the server won't find it. The route prefix is the only valid entry point.

---

## Generating an artifact

1. Choose the template type for the content:
   - **spec** — design spec, requirements, or architecture doc
   - **report** — findings, audit results, data analysis
   - **prototype** — interactive UI demo
   - **dashboard** — metrics and data tables

2. Read the pre-built template for the chosen type:

   ```
   ~/.claude/skills/html-artifact/dist/templates/<type>.html
   ```

   **If the template is too large to read in full:** read only the first 80
   lines (the `<head>` and nav structure), then build the `<body>` from scratch
   following the design system rules below. Never skip the linter step.

3. Every artifact `<head>` must contain exactly these two link tags and nothing
   else for styles:

   ```html
   <link
     href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400;1,600&family=Jost:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap"
     rel="stylesheet"
   />
   <link rel="stylesheet" href="http://localhost:<port>/style/main.css" />
   ```

   Replace `<port>` with the value from config. **Never add a `<style>` block.
   Never use a `file://` path.** The external stylesheet already defines all
   mate tokens and compiled Tailwind/DaisyUI utilities. Reference tokens via
   `var(--mate-*)` in `style=""` inline attrs.

4. Fill the content slots:
   - `<!-- TITLE -->` — artifact title (appears in `<title>`, breadcrumb, and h1)
   - `<!-- DATE -->` — date in `YYYY-MM-DD` format
   - `<!-- CONTENT -->` — replace with your HTML content
   - `<!-- ADDITIONAL META BADGES -->` — optional status chips
   - `<!-- FOOTER LINK -->` — optional link to the live URL if published

5. Write the filled template to the output path.

6. Run the linter and fix every violation before reporting done:
   ```bash
   node ~/.claude/skills/html-artifact/bin/lint-artifact.mjs <output-path>
   ```
   Exit 0 = clean. Exit 1 = violations with file:line context — fix each one.

---

## Design System

Artifacts use DaisyUI v5 + Tailwind v4 as the base layer, with the mate theme
applied via `data-theme="mate"` on `<html>`. Use DaisyUI class names directly
— no custom utilities needed for base components. All mate tokens are defined
in the external stylesheet via CSS custom properties.

### Token vocabulary

**Read `~/.claude/skills/html-artifact/assets/css/tokens.yaml` for current
values.** Never recall hex values from memory — they may change when the
palette evolves. The YAML structure is:

```
palette.<name>.value  → CSS custom property value  (e.g. --mate-primary)
palette.<name>.usage  → when to apply it
frame.<name>.value    → frame/surface color value   (e.g. --mate-frame-bg)
typography.<name>     → font family and weights     (e.g. --mate-font-display)
```

Use token names in inline styles as `var(--mate-<key>)`. Do not invent raw
hex or rgba values — compose from token values only.

### Token usage rules (hard constraints)

These are semantic rules — they hold regardless of what the palette contains.

| Rule                             | Wrong                           | Right                           |
| -------------------------------- | ------------------------------- | ------------------------------- |
| Body / paragraph text            | `color:var(--mate-frame-muted)` | `color:var(--mate-frame-text)`  |
| Table cell content               | `color:var(--mate-frame-muted)` | `color:var(--mate-frame-text)`  |
| Table column headers             | `color:var(--mate-frame-text)`  | `color:var(--mate-frame-muted)` |
| Rail label (small uppercase key) | `color:var(--mate-frame-text)`  | `color:var(--mate-frame-muted)` |
| Rail value (the actual value)    | `color:var(--mate-frame-muted)` | `color:var(--mate-frame-text)`  |
| Body font size                   | `font-size:12px` or `13px`      | `font-size:14px` or `15px`      |
| Light-mode hex in dark theme     | `background:#fef2f2`            | use `rgba()` with token value   |

**The rule of thumb:** if a human reads it as content, use `--mate-frame-text`.
If it labels content above or beside it, use `--mate-frame-muted`.

### DaisyUI components (use directly — no special setup)

navbar, breadcrumbs, btn (all variants), input, select, textarea, label,
form-control, alert (all variants), progress, stats/stat, badge, tooltip,
card, table, footer

### Custom registry components

**Read `~/.claude/skills/html-artifact/assets/registry.yaml` for the current
list.** For exact markup patterns, read the component's
`assets/components/<id>/example.html`. The registry lists component ids,
class names, and when to use each.

See `~/.claude/skills/html-artifact/dist/showcase.html` for the full live reference.

### Agent extension rule

When a new component is needed that isn't in DaisyUI or the registry, compose
it from `var(--mate-*)` tokens using inline styles. Name classes with the
`.mate-` prefix. Do not invent new colors.

---

## Operations

> **Before converting external content to HTML:** check whether the server
> already has a route for it. Markdown files in `md_roots` → use **link-md**
> below. Only generate an HTML artifact when the content genuinely needs the
> mate design system rendered as a standalone page.

### link-md

Use this when the user asks to add a **markdown file** to the artifact index
(e.g. a plan, a spec, a ticket). The server renders it at request time — no
HTML conversion needed.

**Requirements:** the file's absolute path must fall under one of the `md_roots`
entries in `~/.config/html-artifact.json`. Check first:

```bash
cat ~/.config/html-artifact.json | jq '.md_roots'
```

If the path isn't covered, add it to `md_roots` before continuing.

**Get the server URL for the file:**

```bash
mdview --url <absolute-path-to-file>
# → http://localhost:<port>/md?path=%2FUsers%2F...%2Ffile.md
```

**Add a row to `wiki/artifact/index.html`** — use the `/md?path=` URL as the
title link `href`:

```html
<tr>
  <td>
    <a href="/md?path=/Users/.../file.md" style="color:var(--mate-primary);"
      >My Plan</a
    >
  </td>
  <td><span class="badge badge-open">spec</span></td>
  <td
    style="font-family:var(--mate-font-mono);font-size:14px;color:var(--mate-frame-muted);"
  >
    2026-06-15
  </td>
  <td>—</td>
</tr>
```

Commit only the updated `index.html`. No HTML file is created or committed.

### new

1. `AskUserQuestion`: "Scratch (ephemeral) or wiki (committed)?" → `scratch` / `wiki`
2. `AskUserQuestion`: "Type?" → `spec` / `report` / `prototype` / `dashboard`
3. Derive a slug from the user's topic (kebab-case, max 40 chars, date-prefixed: `YYYY-MM-DD-<slug>`).
4. Generate the HTML file following **Generating an artifact** above.
5. Write to:
   - scratch → `<base_dir>/.scratch/artifact/<type>/<slug>.html`
   - wiki → `<base_dir>/wiki/artifact/<type>/<slug>.html`
6. If tier is `wiki`: add row to `wiki/artifact/index.html`, commit:
   `git -C <base_dir> add wiki/artifact/ && git -C <base_dir> commit -m "chore: add artifact <slug>"`.
   Open at `http://localhost:<port>/artifacts/<type>/<slug>.html`.
7. If tier is `scratch`: write file only. No index update, no commit.
   Open at `http://localhost:<port>/scratch/<type>/<slug>.html`.

### promote

1. List `.scratch/artifact/` to show user the available scratch artifacts.
2. `mv <base_dir>/.scratch/artifact/<type>/<slug>.html <base_dir>/wiki/artifact/<type>/`
3. If a `<slug>.html.pub.json` sidecar exists alongside it, move that too.
4. Add row to `wiki/artifact/index.html`.
5. Commit: `git -C <base_dir> add wiki/artifact/ && git -C <base_dir> commit -m "chore: promote artifact <slug>"`.
6. Open at `http://localhost:<port>/artifacts/<type>/<slug>.html`.

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
5. Write/update sidecar `<source>.html.pub.json`:
   ```json
   {
     "slug": "...",
     "owner_key": "...",
     "url": "...",
     "manage_url": "...",
     "published_at": "..."
   }
   ```
6. Update `index.html`: find the `<tr>` whose `<a href>` matches the artifact's
   relative path (e.g. `report/2026-06-09-my-report.html`) and update its
   Published `<td>` with `<a href="[url]">share ↗</a>`. Add a row if none exists.
7. Surface both `url` (share) and `manage_url` (author) to the user.

### serve

```bash
node ~/.claude/skills/html-artifact/bin/artifact-serve.mjs
```

If port `<port>` is already in use, the LaunchAgent is running — skip the
launch and open the URL directly.

Opens `http://localhost:<port>/artifacts/index.html`.

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

   **Optional config keys:**
   - `port` — default `52010`
   - `md_roots` — array of absolute paths the `/md` route is allowed to serve from.
     Example: `"md_roots": ["/Users/me/brain", "/Users/me/apps/myrepo/docs"]`

4. Create directories (route convention shown alongside):
   ```
   <base_dir>/wiki/artifact/spec/          → /artifacts/spec/
   <base_dir>/wiki/artifact/report/        → /artifacts/report/
   <base_dir>/wiki/artifact/prototype/     → /artifacts/prototype/
   <base_dir>/wiki/artifact/dashboard/     → /artifacts/dashboard/
   <base_dir>/.scratch/artifact/spec/      → /scratch/spec/
   <base_dir>/.scratch/artifact/report/    → /scratch/report/
   <base_dir>/.scratch/artifact/prototype/ → /scratch/prototype/
   <base_dir>/.scratch/artifact/dashboard/ → /scratch/dashboard/
   <assets_dir>/
   ```
5. Write empty `wiki/artifact/index.html` (see **index.html** below, with empty tbody).
6. Proceed with the original operation.

---

## index.html

The manifest file at `<base_dir>/wiki/artifact/index.html`. Update on every
`new` (wiki), `promote`, `link-md`, and `publish` operation.

Use the `dashboard` pre-built template as the base. Fill `<!-- TITLE -->` with
`Artifact Index`, then replace `<!-- CONTENT -->` with:

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
    <!-- one <tr> per artifact — added by Claude on new/promote/publish/link-md -->
    <!-- HTML artifact row (href is relative to /artifacts/):
    <tr>
      <td><a href="report/2026-06-09-my-report.html" style="color:var(--mate-primary);">My Report</a></td>
      <td><span class="badge badge-done">report</span></td>
      <td style="font-family:var(--mate-font-mono);font-size:14px;color:var(--mate-frame-muted);">2026-06-09</td>
      <td>—</td>
    </tr>
    -->
    <!-- Markdown row (href is the full /md?path= server URL):
    <tr>
      <td><a href="/md?path=/Users/.../file.md" style="color:var(--mate-primary);">My Plan</a></td>
      <td><span class="badge badge-open">spec</span></td>
      <td style="font-family:var(--mate-font-mono);font-size:14px;color:var(--mate-frame-muted);">2026-06-15</td>
      <td>—</td>
    </tr>
    -->
    <!-- Published — fill the Published td with the share URL:
    <td><a href="https://..." style="color:var(--mate-primary);">share ↗</a></td>
    -->
  </tbody>
</table>
```
