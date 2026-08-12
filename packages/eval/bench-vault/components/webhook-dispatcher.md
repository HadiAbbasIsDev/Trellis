---
id: webhook-dispatcher
type: component
title: Webhook dispatcher
summary: Verifies Stripe signatures, dedupes event ids, and fans events out to
  internal handlers.
confidence: 0.9
tags:
  - billing
created: 2025-06-20T12:00:00.000Z
updated: 2025-06-20T12:00:00.000Z
last_confirmed: 2025-06-20T12:00:00.000Z
edges:
  - rel: implements
    to: stripe-webhooks-must-be-idempotent
  - rel: relates_to
    to: billing-service
---

Signature check first, then an insert-or-skip on the event id, then dispatch. Handlers run via [[bullmq-on-redis-for-background-jobs]].

<!-- trellis:relations -->
## Relations
- implements → [[stripe-webhooks-must-be-idempotent]]
- relates_to → [[billing-service]]
