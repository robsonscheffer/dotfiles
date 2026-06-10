# Maintaining the html-artifact Design System

How-to guide for adding components, changing tokens, and keeping the build healthy.

## Prerequisites

```bash
cd "$(chezmoi source-path)/home/dot_claude/skills/html-artifact"
npm install   # only needed once, or after a fresh clone
```

---

## How to add a custom CSS component

1. **Create the component CSS file** in `src/style/components/<name>.css`.
   Use `var(--mate-*)` tokens — never raw hex values. Name classes descriptively without a prefix.

2. **Add the import** to `src/style/main.css`:

   ```css
   @import "./components/<name>.css";
   ```

3. **Add a showcase section** in `src/showcase.html` so the component appears in the DS reference.
   Copy an existing `<section class="ds-section">` block as a starting point, give it a unique `id`,
   and add a matching `<a class="sidebar-link">` entry in the sidebar nav.

4. **Add a `meta.yaml`** in `assets/components/<name>/meta.yaml`:

   ```yaml
   id: <name>
   name: <Display Name>
   coverage: custom
   description: One-sentence description of the component
   tokens: [--mate-token-used, ...]
   classes:
     - .class-one
     - .class-two
   ```

5. **Rebuild and test** (see below).

6. **Update `skill.md`** — add a row to the Custom registry components table so agents know the new class names.

---

## How to change a token value

1. Edit `src/style/tokens.css` — update the hex value in both the `:root` block (`--mate-*`) and the
   `[data-theme="mate"]` block (the `oklch(from ...)` equivalent).

2. Rebuild and test (see below).

---

## How to rebuild after any source change

```bash
cd "$(chezmoi source-path)/home/dot_claude/skills/html-artifact"
npm run build
npm test
```

`npm run build` re-runs all 5 Vite passes and outputs self-contained HTML to `dist/`.
`npm test` runs 56 integrity checks — file existence, inlined CSS, content slots, token definitions.

If all 56 checks pass, commit and sync:

```bash
DOTFILES=$(chezmoi source-path)
cd "$DOTFILES"
git add home/dot_claude/skills/html-artifact/dist/ home/dot_claude/skills/html-artifact/src/
git commit -m "chore(html-artifact): rebuild DS"
chezmoi apply
```

---

## How to preview the showcase locally

```bash
cd "$(chezmoi source-path)/home/dot_claude/skills/html-artifact"
node bin/artifact-serve.mjs --showcase
```

Opens `dist/showcase.html` at `http://localhost:<port>/showcase.html`.

For live-reload during active development:

```bash
npm run dev
```

This starts a Vite dev server for `src/showcase.html` with hot module replacement.
Note: in dev mode the CSS is not inlined — that only happens on `npm run build`.

---

## How to verify the installed skill after chezmoi apply

```bash
ls ~/.claude/skills/html-artifact/dist/templates/
# spec.html  report.html  prototype.html  dashboard.html

node ~/.claude/skills/html-artifact/bin/artifact-serve.mjs --showcase
```

---

## Build system overview

| File                            | Role                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| `vite.config.js`                | Reads `ENTRY` env var to build one HTML file per pass                                      |
| `src/style/main.css`            | Barrel: `@import tailwindcss`, `@plugin daisyui`, then tokens + 8 component files          |
| `src/style/tokens.css`          | Mate palette as CSS custom properties + DaisyUI theme overrides                            |
| `src/style/components/*.css`    | One file per custom component                                                              |
| `src/showcase.html`             | Full DS reference — all components in context                                              |
| `src/templates/*.html`          | Blank agent-facing shells with `<!-- TITLE -->`, `<!-- DATE -->`, `<!-- CONTENT -->` slots |
| `dist/`                         | Committed built output — agents read from here, never from `src/`                          |
| `test/verify.mjs`               | 56 integrity checks — run via `npm test`                                                   |
| `assets/components/*/meta.yaml` | Machine-readable component registry metadata                                               |

The build uses `vite-plugin-singlefile` which inlines all CSS into each HTML file.
Because singlefile requires a single entry point per Vite invocation, `npm run build` is a
`for` loop that runs `ENTRY=<name> vite build` five times.
