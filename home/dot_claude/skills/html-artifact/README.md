# html-artifact

Generates polished HTML artifacts using the mate design system — specs, reports, prototypes, and dashboards. Manages two-tier storage (scratch / wiki), promotes to committed wiki, and publishes to a live URL via the html-publisher plugin.

## How it works

CSS is authored in split source files (`src/style/`), compiled by Vite + Tailwind v4 + DaisyUI v5 into self-contained HTML templates, and committed to `dist/`. Agents read a pre-built template, fill content slots, and never touch the `<style>` block.

## For agents

Invoke with `/html-artifact` or `/artifact`. Full instructions in [`skill.md`](./skill.md).

Quick path:

1. Read `~/.claude/skills/html-artifact/dist/templates/<type>.html`
2. Fill `<!-- TITLE -->`, `<!-- DATE -->`, `<!-- CONTENT -->`
3. Write to output path

## For maintainers

See [`docs/MAINTAINING.md`](./docs/MAINTAINING.md) — adding components, changing tokens, rebuilding, testing.

```bash
cd "$(chezmoi source-path)/home/dot_claude/skills/html-artifact"
npm run build && npm test
```

## Directory layout

```
src/              CSS and HTML source (edit here)
  style/          tokens.css + 8 component files + main.css barrel
  showcase.html   full DS reference (all components in context)
  templates/      blank shells agents fill: spec, report, prototype, dashboard
dist/             built output committed to dotfiles (agents read from here)
assets/           component registry metadata (meta.yaml per component)
bin/              artifact-serve.mjs — local static server
test/             verify.mjs — 56 build integrity checks
docs/             MAINTAINING.md
```

## DS reference

```bash
node bin/artifact-serve.mjs --showcase
# opens dist/showcase.html at http://localhost:<port>/showcase.html
```
