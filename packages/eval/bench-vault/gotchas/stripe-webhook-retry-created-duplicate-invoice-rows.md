---
id: stripe-webhook-retry-created-duplicate-invoice-rows
type: gotcha
title: Stripe webhook retry created duplicate invoice rows
summary: Retried invoice.paid events created duplicate invoice rows; fixed by
  storing processed Stripe event ids.
confidence: 0.95
tags:
  - billing
created: 2025-12-10T12:00:00.000Z
updated: 2025-12-10T12:00:00.000Z
last_confirmed: 2025-12-10T12:00:00.000Z
edges:
  - rel: observed_in
    to: session-2025-12-10-billing-hardening
  - rel: relates_to
    to: stripe-webhooks-must-be-idempotent
---

During a 20-minute API outage Stripe queued deliveries and then re-sent everything. Handlers were not idempotent yet. Cleanup in [[session-2025-12-10-billing-hardening]].

<!-- trellis:relations -->
## Relations
- observed_in → [[session-2025-12-10-billing-hardening]]
- relates_to → [[stripe-webhooks-must-be-idempotent]]
