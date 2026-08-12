---
id: session-2025-12-10-billing-hardening
type: session
title: "Session 2025-12-10: billing hardening"
summary: Added webhook event-id dedupe, wrote the idempotency rule down, and
  cleaned up duplicated invoice rows.
confidence: 0.8
tags:
  - billing
created: 2025-12-10T12:00:00.000Z
updated: 2025-12-10T12:00:00.000Z
last_confirmed: 2025-12-10T12:00:00.000Z
edges: []
---

Backfilled a unique index on the Stripe event id; 14 tenants had duplicated rows to repair.
