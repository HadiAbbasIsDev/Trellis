---
id: per-seat-pricing-with-monthly-true-up
type: decision
title: Per-seat pricing with monthly true-up
summary: Bill per active seat with a monthly true-up job instead of instant
  proration on each seat event.
confidence: 0.9
tags:
  - billing
created: 2025-12-16T12:00:00.000Z
updated: 2025-12-16T12:00:00.000Z
last_confirmed: 2025-12-16T12:00:00.000Z
edges:
  - rel: supersedes
    to: instant-proration-on-seat-updates
  - rel: depends_on
    to: stripe-for-subscription-billing
---

Stripe computes every adjustment itself now; see [[stripe-disagreed-on-proration-rounding]] for why we stopped doing the math. The true-up job counts active seats on the last day and reports the quantity.

<!-- trellis:relations -->
## Relations
- supersedes → [[instant-proration-on-seat-updates]]
- depends_on → [[stripe-for-subscription-billing]]
