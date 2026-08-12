---
id: redis-allkeys-lru-evicted-bullmq-jobs
type: gotcha
title: Redis allkeys-lru evicted BullMQ jobs
summary: maxmemory allkeys-lru silently dropped BullMQ job keys from the queue
  under pressure; switched to noeviction with an alarm.
confidence: 0.95
tags:
  - workers
  - infra
created: 2026-07-01T12:00:00.000Z
updated: 2026-07-01T12:00:00.000Z
last_confirmed: 2026-07-01T12:00:00.000Z
edges:
  - rel: relates_to
    to: redis-cache-layer
  - rel: relates_to
    to: worker-jobs-must-be-safe-to-run-twice
---

Reminder jobs vanished with no error anywhere — the eviction happened inside Redis. Idempotent handlers ([[worker-jobs-must-be-safe-to-run-twice]]) made the re-enqueue backfill safe.

<!-- trellis:relations -->
## Relations
- relates_to → [[redis-cache-layer]]
- relates_to → [[worker-jobs-must-be-safe-to-run-twice]]
