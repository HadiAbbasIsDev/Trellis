---
id: bullmq-on-redis-for-background-jobs
type: decision
title: BullMQ on Redis for background jobs
summary: BullMQ on Redis runs reminders, rota generation, and exports as
  retryable background jobs.
confidence: 0.9
tags:
  - stack
  - workers
created: 2025-06-10T12:00:00.000Z
updated: 2025-06-10T12:00:00.000Z
last_confirmed: 2025-06-10T12:00:00.000Z
edges: []
---

Delayed jobs and per-tenant rate limiting out of the box; one less piece of infrastructure since Redis is already there for caching.
