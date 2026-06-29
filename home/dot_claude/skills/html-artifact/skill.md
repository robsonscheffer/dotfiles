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

   > **Font source of truth:** the Google Fonts URL above must match the
   > `typography` entries in `tokens.yaml`. If tokens.yaml changes font families,
   > update this URL to match — never keep them out of sync.

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

**Append an entry to `wiki/artifact/artifacts.json`** — set `file` to the
full `/md?path=...` URL:

```json
{
  "title": "My Plan",
  "type": "spec",
  "tier": "wiki",
  "created": "2026-06-15",
  "url": null,
  "file": "/md?path=/Users/.../file.md"
}
```

Commit only `artifacts.json`. No HTML file is created or modified.

### new

1. `AskUserQuestion`: "Scratch (ephemeral) or wiki (committed)?" → `scratch` / `wiki`
2. `AskUserQuestion`: "Type?" → `spec` / `report` / `prototype` / `dashboard`
3. Derive a slug from the user's topic (kebab-case, max 40 chars, date-prefixed: `YYYY-MM-DD-<slug>`).
4. Generate the HTML file following **Generating an artifact** above.
5. Write to:
   - scratch → `<base_dir>/.scratch/artifact/<type>/<slug>.html`
   - wiki → `<base_dir>/wiki/artifact/<type>/<slug>.html`
6. If tier is `wiki`: append entry to `wiki/artifact/artifacts.json`, commit:
   `git -C <base_dir> add wiki/artifact/ && git -C <base_dir> commit -m "chore: add artifact <slug>"`.
   Open at `http://localhost:<port>/artifacts/<type>/<slug>.html`.
7. If tier is `scratch`: write file only. No index update, no commit.
   Open at `http://localhost:<port>/scratch/<type>/<slug>.html`.

### promote

1. List `.scratch/artifact/` to show user the available scratch artifacts.
2. `mv <base_dir>/.scratch/artifact/<type>/<slug>.html <base_dir>/wiki/artifact/<type>/`
3. If a `<slug>.html.pub.json` sidecar exists alongside it, move that too.
4. Append entry to `wiki/artifact/artifacts.json`.
5. Commit: `git -C <base_dir> add wiki/artifact/ && git -C <base_dir> commit -m "chore: promote artifact <slug>"`.
6. Open at `http://localhost:<port>/artifacts/<type>/<slug>.html`.

### publish

Published files are served externally — `localhost` URLs won't resolve for
readers. Before uploading, inline the stylesheet into a self-contained copy.
The source file on disk is never modified.

1. Determine source path.

2. **Build a publish-ready copy (inline the stylesheet):**
   a. Read the source HTML.
   b. Fetch the CSS: `curl -s http://localhost:<port>/style/main.css`
   If curl fails (server not running), abort and tell the user to start it first.
   c. In the HTML string, replace the stylesheet link tag exactly:

   ```
   <link rel="stylesheet" href="http://localhost:<port>/style/main.css" />
   ```

   with an inline style block:

   ```html
   <style>
     /* mate DS — inlined at publish time */
     <css content>
   </style>
   ```

   d. Write the result to a temp file: `/tmp/<slug>-publish.html`
   e. The Google Fonts `<link>` is a public URL — leave it unchanged.

3. Check for `<source>.pub.json` sidecar.
   - If sidecar exists: call html-publisher with `--slug <slug> --owner-key <key>` (update).
   - If not: call html-publisher for new page.

4. Call html-publisher using the **temp file** as `--source`:

   ```bash
   RESULT=$(${PLUGIN_ROOT:html-publisher}/bin/publish share-html \
     --source /tmp/<slug>-publish.html \
     [--slug <slug> --owner-key <key>])
   ```

5. Delete the temp file (success or failure): `rm /tmp/<slug>-publish.html`

6. Parse JSON result. Check `ok`. If false, surface `error` to user and stop.

7. Write/update sidecar `<source>.html.pub.json` (next to the **source** file, not the temp):

   ```json
   {
     "slug": "...",
     "owner_key": "...",
     "url": "...",
     "manage_url": "...",
     "published_at": "..."
   }
   ```

8. Update `artifacts.json`: find the entry whose `file` matches the artifact's
   relative path and set its `url` to the share URL. Add an entry if none exists.

9. Surface both `url` (share) and `manage_url` (author) to the user.

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
5. Bootstrap the index from the skill's own templates:
   ```bash
   cp ~/.claude/skills/html-artifact/dist/templates/index.html <base_dir>/wiki/artifact/index.html
   cp ~/.claude/skills/html-artifact/dist/templates/artifacts.json <base_dir>/wiki/artifact/artifacts.json
   ```
   `index.html` is the full UI shell; `artifacts.json` starts as `[]`.
   Commit both: `git -C <base_dir> add wiki/artifact/index.html wiki/artifact/artifacts.json && git -C <base_dir> commit -m "chore: bootstrap artifact index"`.
6. Proceed with the original operation.

---

## index.html

The manifest file at `<base_dir>/wiki/artifact/index.html`. Update on every
`new` (wiki), `promote`, `link-md`, and `publish` operation.

**Do not regenerate from scratch.** The index fetches its data from
`<base_dir>/wiki/artifact/artifacts.json` at runtime. Agents only touch the
JSON file — never the HTML.

To add an artifact, append one object to `artifacts.json`:

```json
{
  "title": "My Report",
  "type": "report",
  "tier": "wiki",
  "created": "2026-06-09",
  "url": null,
  "file": "report/2026-06-09-my-report.html"
}
```

Fields:

- `type` — `report` | `spec` | `prototype` | `dashboard` | `walk`
- `tier` — `wiki` | `scratch`
- `url` — live share URL if published, `null` otherwise
- `file` — relative path from `/artifacts/`, **or** a full `/md?path=...` URL for markdown routes

**When publish succeeds**, set `url` on the matching entry to the share URL.

The index renders, sorts newest-first, filters, and updates the "Updated" line
automatically from the JSON data — no HTML changes needed.

---

## Layout patterns — critical gotchas

These are hard-won findings from building the index. Apply them any time you
write a full-page artifact layout (not just content slots inside a template).

### Container class collision

Never name a layout wrapper `.container` — Tailwind has a built-in `.container`
utility that will override it and produce narrower-than-intended widths. Use
`.page-wrap` instead:

```css
.page-wrap {
  max-width: 1100px;
  width: 100%;
  margin: 0 auto;
  padding: 0 1.5rem;
}
```

The `width: 100%` is mandatory. In a `flex-direction: column` parent,
`margin: 0 auto` cancels `align-items: stretch` and shrinks the item to content
width — `width: 100%` restores full-width behavior.

### Inline styles for CSS custom properties

Tailwind arbitrary-value classes like `bg-[var(--mate-frame-nav)]` silently
produce no output. Always use `style=""` for `var(--mate-*)` values:

```html
<!-- Wrong — Tailwind silently ignores this -->
<header class="bg-[var(--mate-frame-nav)]">
  <!-- Right -->
  <header style="background: var(--mate-frame-nav);"></header>
</header>
```

### Hero band layout

Full-width tinted section behind the page title; inner `.page-wrap` sizes the
content. No stats strip — the filter count already answers "how many".

```html
<div
  style="background: var(--mate-frame-sidebar); border-bottom: 1px solid var(--mate-frame-border);"
>
  <div class="page-wrap" style="padding-top: 2rem; padding-bottom: 1.75rem;">
    <h1
      style="font-family: var(--mate-font-display); font-size: 2rem; font-weight: 700; margin: 0 0 .4rem; color: var(--mate-frame-text);"
    >
      Page Title
    </h1>
    <p
      style="margin: 0 0 .5rem; font-size: 15px; color: var(--mate-frame-text);"
    >
      One-line subtitle.
    </p>
    <span
      id="last-updated"
      style="font-size: 12px; font-family: var(--mate-font-mono); color: var(--mate-frame-muted);"
    ></span>
  </div>
</div>
```

Populate "last updated" from data — in the index this happens inside the
`fetch().then()` callback after `artifacts.json` loads, never from `new Date()`.

### Table scroll with always-visible footer

Makes the table scroll in its own height so the footer stays on screen.

```html
<main
  style="display: flex; flex-direction: column; min-height: calc(100vh - 48px);"
>
  <div
    class="page-wrap"
    style="padding-top: 1.5rem; padding-bottom: 2rem; flex: 1; display: flex; flex-direction: column;"
  >
    <!-- toolbar here -->
    <div
      style="flex: 1; overflow: hidden; border-top: 1px solid var(--mate-frame-border);"
    >
      <div style="height: 100%; overflow-y: auto; overflow-x: auto;">
        <table class="table" style="min-width: 480px;">
          <thead
            style="position: sticky; top: 0; z-index: 1; background: var(--mate-frame-sidebar);"
          >
            ...
          </thead>
          <tbody>
            ...
          </tbody>
        </table>
      </div>
    </div>
    <!-- footer here, always visible -->
  </div>
</main>
```

### Mobile filter scroll

Prevent the `join` pill group from wrapping and breaking its border on small screens:

```html
<div style="overflow-x: auto; -webkit-overflow-scrolling: touch;">
  <div class="join" style="flex-wrap: nowrap; white-space: nowrap;">
    <button class="btn btn-sm btn-active join-item" data-filter="all">
      All
    </button>
    ...
  </div>
</div>
```

Hide secondary table columns on mobile with a class:

```css
@media (max-width: 640px) {
  th.hide-mobile,
  td.hide-mobile {
    display: none;
  }
}
```

### Theme switcher

Use a plain `<select>` with inline styles — the DaisyUI `select` class breaks
the compact look. The four valid theme options are exactly:

```html
<select
  onchange="document.documentElement.setAttribute('data-theme', this.value)"
  style="background: var(--mate-frame-nav); color: var(--mate-frame-text); border: 1px solid var(--mate-frame-border); border-radius: 6px; padding: 2px 8px; font-size: 13px; cursor: pointer;"
>
  <option value="mate">mate</option>
  <option value="mate-light">mate-light</option>
  <option value="gruvbox">gruvbox</option>
  <option value="gruvbox-light">gruvbox-light</option>
</select>
```

Do not add any other theme options — they will silently render with broken colors.

### Filter state with class toggling

Toggle `btn-active` / `btn-ghost` classes — do not use `aria-pressed` for
visual state in this system:

```js
document.querySelectorAll("[data-filter]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-filter]").forEach((b) => {
      b.classList.remove("btn-active");
      b.classList.add("btn-ghost");
    });
    btn.classList.add("btn-active");
    btn.classList.remove("btn-ghost");
    applyFilters();
  });
});
```

### Sort newest-first

Default sort for any date-ordered list:

```js
const sorted = [...items].sort((a, b) => b.created.localeCompare(a.created));
```
