# The shape, worked end to end

An illustrative body, built on a shape approved section by section during calibration.
Copy the shape, not the words. A table swap on an invoices page: the page moves onto a component
that was already merged and unused.

**Title**

```
[SHOP-1412] Point the invoices page at the shared DataGrid
```

58 characters, counted with a tool. Not estimated, and not "Swap the table component", which
describes the code instead of the change.

## Canonical shape

Where-to-look and Risk stay closed here: 10 files centred on one component, no flag, no deploy
order, nothing absent that reads as an oversight. Two of six slots is normal.

```markdown
## What

The invoices page was still drawing `LegacyTable` while `DataGrid` sat merged and unused. This
points the page at the grid.

On screen that means sorting moves from a dropdown to clickable column headers, and the
no-invoices panel becomes the same grid in its empty state instead of a separate hand-built one.

## Why

The grid asks for a `SortSpec` and the existing fetch chain speaks the legacy `SortOrder`. I
translate between them at the `useInvoiceRows` boundary rather than changing the four functions
below it, so this stays a swap instead of becoming a data-path refactor.

## Testing

The table is found by its column headers now, so both invoices specs and the Playwright page
object moved with it. `DataGrid.test.tsx` covers the populated and empty states.

Column widths and header wrapping need real layout, which jsdom does not have. I checked those
in Storybook.

## Links

- Ticket: [SHOP-1412](https://example.atlassian.net/browse/SHOP-1412)

<details>
<summary>Notes for AI agents</summary>

- `SortOrder` to `SortSpec` translation lives only in `useInvoiceRows`. The four fetch functions
  below it still take `SortOrder` on purpose.
- `LegacyTable` still has two other callers, so it stays in the tree.
- Verify: `pnpm test DataGrid invoices`.

</details>
```

150 words outside the `<details>` block. The cap for a standard slice is 200. The agent notes add
facts a follow-up agent would otherwise re-derive from the code, and a human never has to open them.

## Mapping to a repo template

Same content, rendered into the repo's required headings. What and Why cross over unchanged.
Testing answers the repo's testing question. Links becomes the repo's documentation section, with
its unused rows answered rather than deleted, because a template-enforcement hook matches headings
as literal substrings. Where-to-look and Risk, when open, fold into Why.

The browser checkboxes and the before image are the two things a draft cannot fill on its own.
Tick a box only if this session actually opened that browser. Otherwise leave it unchecked and
leave the screenshot row empty for the author.

## Why it reads the way it does

**What opens on the situation, not the code.** "Was still drawing `LegacyTable` while
`DataGrid` sat merged and unused" tells a reviewer why this PR exists at all. The verdict
sentence stands alone. Then "on screen that means" translates it into something observable, which
is the move that stops the section describing what the diff already shows.

**Why is one decision.** The adapter placement is the single thing a reviewer would question, so it
gets the whole section. First person, the rejected alternative named, and the consequence of the
choice stated. A second decision would dilute it. Earlier drafts that listed two read worse.

**Testing leads with what moved.** The selectors changed, so that goes first: it is the part of the
test surface this PR rewrote and the thing worth a glance in the diff. Then coverage. Then the gap,
with where it got covered instead. No pass counts, no suite inventory, no "all specs pass".

**Nothing narrates the work.** No "turns out", no "while tracing this I found", no "the plan
originally said". That content existed while the change was being built. If one of those facts
turns out to matter, it comes back as a reply to the review comment that asked for it.
