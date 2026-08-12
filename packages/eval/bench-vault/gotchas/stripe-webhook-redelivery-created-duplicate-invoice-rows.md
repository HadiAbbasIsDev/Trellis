---
id: stripe-webhook-redelivery-created-duplicate-invoice-rows
type: gotcha
title: Stripe webhook redelivery created duplicate invoice rows
summary: Redelivered invoice.paid events created duplicate invoice rows; fixed
  by checking stored Stripe event ids.
confidence: 0.85
tags:
  - billing
created: 2026-06-09T12:00:00.000Z
updated: 2026-06-09T12:00:00.000Z
last_confirmed: 2026-06-09T12:00:00.000Z
edges:
  - rel: relates_to
    to: webhook-dispatcher
---

Recorded while debugging a customer report months later — the insert-or-skip guard in [[webhook-dispatcher]] is what protects this path.

<!-- trellis:relations -->
## Relations
- relates_to → [[webhook-dispatcher]]
