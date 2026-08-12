---
id: session-2026-01-22-schedule-normalization
type: session
title: "Session 2026-01-22: schedule normalization"
summary: Migrated schedule jsonb blobs into shift and rota tables; backfilled 41
  million rows with zero downtime using dual writes.
confidence: 0.8
tags:
  - storage
created: 2026-01-22T12:00:00.000Z
updated: 2026-01-22T12:00:00.000Z
last_confirmed: 2026-01-22T12:00:00.000Z
edges: []
---

Dual-write window ran nine days; verification compared row counts and sampled diffs per tenant.
