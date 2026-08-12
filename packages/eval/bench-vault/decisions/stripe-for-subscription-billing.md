---
id: stripe-for-subscription-billing
type: decision
title: Stripe for subscription billing
summary: Stripe Billing runs subscriptions, invoices, and payment retries; we
  never store card data ourselves.
confidence: 0.95
tags:
  - billing
  - stack
created: 2025-05-14T12:00:00.000Z
updated: 2025-05-14T12:00:00.000Z
last_confirmed: 2025-05-14T12:00:00.000Z
edges: []
---

Dunning, tax, and SCA come managed. The integration surface we own is [[billing-service]] plus [[webhook-dispatcher]].
