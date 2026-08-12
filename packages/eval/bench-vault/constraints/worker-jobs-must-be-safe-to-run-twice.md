---
id: worker-jobs-must-be-safe-to-run-twice
type: constraint
title: Worker jobs must be safe to run twice
summary: "Handlers must be idempotent: retries and stalled recovery will
  re-execute them with the same payload."
confidence: 0.95
tags:
  - workers
  - reliability
created: 2025-10-21T12:00:00.000Z
updated: 2025-10-21T12:00:00.000Z
last_confirmed: 2025-10-21T12:00:00.000Z
edges:
  - rel: relates_to
    to: bullmq-on-redis-for-background-jobs
---

BullMQ re-delivers after a crash or stall, so a handler that ran halfway will run again. Guard side effects with natural idempotency or an outbox row.

<!-- trellis:relations -->
## Relations
- relates_to → [[bullmq-on-redis-for-background-jobs]]
