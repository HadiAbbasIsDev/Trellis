---
id: stripe-webhooks-must-be-idempotent
type: constraint
title: Stripe webhook handlers must be idempotent
summary: Every webhook handler must tolerate duplicate delivery; Stripe retries
  events for up to 72 hours.
confidence: 1
tags:
  - billing
  - reliability
created: 2025-12-10T12:00:00.000Z
updated: 2025-12-10T12:00:00.000Z
last_confirmed: 2025-12-10T12:00:00.000Z
edges:
  - rel: observed_in
    to: session-2025-12-10-billing-hardening
---

Store the Stripe event id before side effects and skip on conflict. Established after the double-invoice incident in [[session-2025-12-10-billing-hardening]].

<!-- trellis:relations -->
## Relations
- observed_in → [[session-2025-12-10-billing-hardening]]
