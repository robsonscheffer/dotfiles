# Warehouse notes

A quick overview of how the acme/web checkout flow logs orders.

## What it covers

- Order intake
- Refund handling
- [Full reference](https://example.com/acme/reference)

## Steps to look at

1. Read the intake queue
2. Check the label rule
3. Confirm the refund path

| Stage | Owner | Status |
| --- | --- | --- |
| Intake | Sam | done |
| Refund | Alex | in progress |

```ts title="src/orders/intake.ts"
export function intake(order) {
  queue.push(order);
}
```
