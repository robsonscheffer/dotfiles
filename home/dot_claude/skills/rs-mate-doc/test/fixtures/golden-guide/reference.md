---
title: Reference
type: guide
shape: guide
---

# Reference

:::decide Priya
Should the refund window change from 14 days to 30 days for annual plans?
:::

:::risks
| Risk | Likelihood | Owner |
| --- | --- | --- |
| Refund webhook retries silently drop | MED | Alex |
| Fast checkout miscounts guest orders | HIGH | Priya |
:::

:::reveal Show reviewer notes
Priya flagged the 30-day window as a bigger accounting change than it looks.
:::

:::checks
met | Refund window is documented for partners | C2
partial | Retry idempotency covered |
not-met | Guest order count reconciled |
n/a | Legacy cart flow |
:::

:::timeline
2026-08-01 | Refund window proposal opened
2026-08-20 | Priya raised the accounting concern
2026-09-10 | Still awaiting sign-off
:::

:::progress 3/4 Reference guide review
:::

## Open claims

:::notverified
:::
