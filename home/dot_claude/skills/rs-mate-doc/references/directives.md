# Directives

A directive is a fenced block: `:::name args` on its own line, content, then `:::`. Claim refs work inside them. An unknown name is a lint error.

Inline: `:badge[label]{tone=bad}` renders a small rounded label. Tones: `good`, `warn`, `bad`,
`info`, `neutral` (default when omitted or unrecognized). Works anywhere inline text does,
including inside a table cell. Lint warns on a `tone` outside that set (`badge-tone`).

```markdown
Rollout is :badge[Blocked]{tone=bad} pending the flag flip.

| Item | Status |
| --- | --- |
| Refund flow | :badge[On track]{tone=good} |
```

| Directive | Use it for | Content |
| --- | --- | --- |
| `tiles` | a few headline numbers, optionally with a delta | one `Label: value {Cn}` per line |
| `cards` | links to other pages in the doc | a markdown list of links |
| `means` | defining a term the reader will trip on | prose |
| `collide <term>` | a term that means something else elsewhere | prose |
| `warn` | a mistake the reader is likely to make | prose |
| `note` | an aside worth keeping | prose |
| `steps` | ordered actions | one paragraph per step, blank line between |
| `tabs` | parallel variants (per platform, per team) | each `## Tab name` heading starts a tab |
| `flow` | who talks to whom, in order | `a -> b: label` per line, rendered as SVG |
| `decide <person>` | the decision someone must make, and by when | prose |
| `risks` | risks with likelihood and owner | a markdown table, one row per risk |
| `notverified` | the list of open claims | leave empty; it fills itself |
| `rail` | a sticky side panel (a spec's status, a walk's PR summary) | one `Key: value` per line |
| `reveal <label>` | content worth hiding until asked for | prose, behind a button; print shows it expanded |
| `checks` | acceptance criteria or a status check list | one `status \| item \| evidence` per line |
| `timeline` | a sequence of dated events | one `date \| text` per line |
| `progress <done/total> [label]` | how far a rollout or checklist has gotten | no body |

A `rail` sits above the table of contents in the page's side column, or inline at the top on
narrow screens. Values may hold a markdown link (`[text](url)`) and/or a badge, nothing else.

A `risks` row is any cell whose text is exactly `HIGH`, `MED`, or `LOW`; that row renders as a
card with a colored left border and a badge, instead of a plain table cell, so severity reads
at a glance without a legend.

A `checks` status is `met`, `partial`, `not-met`, or `n/a`, mapped to the same badge tones as
`:badge`: `met`=good, `partial`=warn, `not-met`=bad, `n/a`=neutral.

`progress` is a block directive, not the inline `:badge`-style syntax, so it can sit on its own
line as a standalone bar with an accessible label (`role="progressbar"`, `aria-valuenow`,
`aria-valuemax`) rather than being squeezed into running prose.

A `tiles` line can carry a delta: `Label: value +12% up good-when:up`. `up`/`down` is the
delta's own direction; `good-when` says which direction is the improvement, so color follows
that meaning instead of the sign (a delta of `-3 down good-when:down` still renders as good).
`good-when` defaults to `up` when left off.

```markdown
:::tiles
Fast checkout orders: 312 {C3}
Refund window: 14 days {C4}
Signups: 1,204 +12% up good-when:up
Churn: 42 -3 down good-when:down
:::

:::steps
Open the order in the admin panel.

Confirm the refund window has not passed. {C4}
:::

:::tabs
## Storefront

Customers request a refund from their order history page.

## Orders service

Support agents issue the refund against the order record.
:::

:::flow
customer -> support: request refund
support -> orders: issue refund
:::

:::decide Priya
Should the refund window change from 14 to 30 days for annual plans?
:::

:::rail
Author: Priya
PR: [#42](https://example.com/acme/console/pull/42)
Status: :badge[On track]{tone=good}
:::

:::reveal Show reviewer notes
Priya flagged the 30-day window as a bigger accounting change than it looks.
:::

:::checks
met | Refund window is documented for partners | C2
partial | Retry idempotency covered |
not-met | Guest order count reconciled |
:::

:::timeline
2026-08-01 | Refund window proposal opened
2026-09-10 | Still awaiting sign-off
:::

:::progress 3/4 Reference guide review
:::

## Open claims

:::notverified
:::
```

## Diff fences

A fenced code block with info string `diff` colors `+`/`-` lines and takes two optional keys:
`file=<path>` for a file header, `start=<line>` to number added, removed, and context lines
from that line. Either can appear alone.

````markdown
```diff file=src/analytics/label.ts start=40
 function label(el) {
-  return el.dataset.name
+  return el.closest('[data-analytics-name]')?.dataset.analyticsName
 }
```
````

## Frontmatter

```yaml
---
title: Checkout guide
summary: One line a reader sees in listings.
status: draft          # draft until a person runs approve
shape: guide           # plain | guide | brief | dashboard
tour:                  # guide/brief only: reading order of pages
  - index
  - how-to-refund
---
```

Leave `status`, `approved_by`, `approved_at`, and `ledger_hash` alone beyond `draft`; `approve` writes them.

`notes: true` turns on a per-section notes box under each `h2`: a reader's text saves to their
own browser only, never into the page file, plus a copy/download toolbar at the top of the page.
