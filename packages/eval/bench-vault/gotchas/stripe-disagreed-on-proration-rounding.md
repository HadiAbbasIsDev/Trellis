---
id: stripe-disagreed-on-proration-rounding
type: gotcha
title: Stripe disagreed on proration rounding
summary: Our cent rounding of prorated seat charges disagreed with Stripe's;
  invoices came out off by one cent and failed reconciliation — let Stripe
  compute proration.
confidence: 0.95
tags:
  - billing
created: 2025-11-18T12:00:00.000Z
updated: 2025-11-18T12:00:00.000Z
last_confirmed: 2025-11-18T12:00:00.000Z
edges:
  - rel: relates_to
    to: instant-proration-on-seat-updates
  - rel: relates_to
    to: billing-service
---

Stripe rounds per line item, we rounded the total. Not worth re-implementing; the pricing model moved to [[per-seat-pricing-with-monthly-true-up]].

<!-- trellis:relations -->
## Relations
- relates_to → [[instant-proration-on-seat-updates]]
- relates_to → [[billing-service]]
