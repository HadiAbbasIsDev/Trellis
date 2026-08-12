---
id: normalize-schedule-tables-drop-jsonb
type: decision
title: Normalize schedule tables and drop jsonb blobs
summary: Shift and rota data live in first-class relational tables now; jsonb
  blobs made rotation lookups unindexable.
confidence: 0.9
tags:
  - storage
created: 2026-01-22T12:00:00.000Z
updated: 2026-01-22T12:00:00.000Z
last_confirmed: 2026-01-22T12:00:00.000Z
edges:
  - rel: supersedes
    to: move-schedules-to-postgres-jsonb
  - rel: observed_in
    to: session-2026-01-22-schedule-normalization
---

One jsonb document per [[rota]] meant every rotation lookup re-parsed the blob and no index could help. Executed in [[session-2026-01-22-schedule-normalization]].

<!-- trellis:relations -->
## Relations
- supersedes → [[move-schedules-to-postgres-jsonb]]
- observed_in → [[session-2026-01-22-schedule-normalization]]
