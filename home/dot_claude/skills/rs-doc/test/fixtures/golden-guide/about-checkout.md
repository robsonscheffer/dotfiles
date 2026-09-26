---
title: About checkout
type: guide
shape: guide
---

# About checkout

:::means
"Fast checkout" means an order skips the address confirmation step because the shipping
address matches a saved default.
:::

Checkout has a public API too. The refund endpoint is documented for partners. {C2}

:::collide checkout
In the orders service, "checkout" means the cart-to-order transition, not the fast-checkout
skip described above.
:::

:::warn
Do not confuse the storefront "checkout" step with the orders service "checkout" step; they
run on different services.
:::

:::note
Sam owns the storefront checkout flow. Alex owns the orders service side.
:::
