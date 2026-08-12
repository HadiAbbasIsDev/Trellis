---
id: billing-service
type: component
title: Billing service
summary: "Wraps Stripe: subscription lifecycle, seat counting, invoice preview,
  and dunning state."
confidence: 0.9
tags:
  - billing
created: 2025-06-05T12:00:00.000Z
updated: 2025-06-05T12:00:00.000Z
last_confirmed: 2025-06-05T12:00:00.000Z
edges:
  - rel: implements
    to: stripe-for-subscription-billing
  - rel: relates_to
    to: seat
---

The only module allowed to call Stripe. Everything else asks it.

<!-- trellis:relations -->
## Relations
- implements → [[stripe-for-subscription-billing]]
- relates_to → [[seat]]
