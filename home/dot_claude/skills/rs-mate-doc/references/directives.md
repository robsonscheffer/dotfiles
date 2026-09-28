# Directives

A directive is a fenced block: `:::name args` on its own line, content, then `:::`. Claim refs work inside them. An unknown name is a lint error.

| Directive | Use it for | Content |
| --- | --- | --- |
| `tiles` | a few headline numbers | one `Label: value {Cn}` per line |
| `cards` | links to other pages in the doc | a markdown list of links |
| `means` | defining a term the reader will trip on | prose |
| `collide <term>` | a term that means something else elsewhere | prose |
| `warn` | a mistake the reader is likely to make | prose |
| `note` | an aside worth keeping | prose |
| `steps` | ordered actions | one paragraph per step, blank line between |
| `tabs` | parallel variants (per platform, per team) | each `## Tab name` heading starts a tab |
| `flow` | who talks to whom, in order | `a -> b: label` per line, rendered as SVG |
| `decide <person>` | the decision someone must make, and by when | prose |
| `risks` | risks with likelihood and owner | a markdown table |
| `notverified` | the list of open claims | leave empty; it fills itself |

```markdown
:::tiles
Fast checkout orders: 312 {C3}
Refund window: 14 days {C4}
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

## Open claims

:::notverified
:::
```

## Frontmatter

```yaml
---
title: Checkout guide
summary: One line a reader sees in listings.
status: draft          # draft until a person runs approve
shape: guide           # plain | guide | brief
tour:                  # guide/brief only: reading order of pages
  - index
  - how-to-refund
---
```

Leave `status`, `approved_by`, `approved_at`, and `ledger_hash` alone beyond `draft`; `approve` writes them.
