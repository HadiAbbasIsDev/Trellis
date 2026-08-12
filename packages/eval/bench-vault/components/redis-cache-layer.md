---
id: redis-cache-layer
type: component
title: Redis cache layer
summary: Redis holds session cache, rate-limit counters, and BullMQ state;
  maxmemory policy is noeviction.
confidence: 0.9
tags:
  - infra
created: 2025-06-12T12:00:00.000Z
updated: 2025-06-12T12:00:00.000Z
last_confirmed: 2025-06-12T12:00:00.000Z
edges:
  - rel: relates_to
    to: bullmq-on-redis-for-background-jobs
---

Sized at 4 GB with alarms at 80% utilization. BullMQ shares this instance deliberately — one fewer moving part.

<!-- trellis:relations -->
## Relations
- relates_to → [[bullmq-on-redis-for-background-jobs]]
