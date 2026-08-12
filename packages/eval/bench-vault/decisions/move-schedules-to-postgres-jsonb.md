---
id: move-schedules-to-postgres-jsonb
type: decision
title: Move schedule storage to Postgres jsonb
summary: Moved schedule storage to Postgres jsonb so schedules join with tenant
  and billing tables in one database.
confidence: 0.85
tags:
  - storage
created: 2025-10-07T12:00:00.000Z
updated: 2025-10-07T12:00:00.000Z
last_confirmed: 2025-10-07T12:00:00.000Z
edges:
  - rel: supersedes
    to: mongodb-for-flexible-schedule-documents
  - rel: depends_on
    to: postgres-primary-cluster
---

Running MongoDB next to Postgres doubled backup and failover work, and cross-store joins for billing were hand-rolled in app code. Jsonb keeps the flexible shape but in the same database as everything else.

<!-- trellis:relations -->
## Relations
- supersedes → [[mongodb-for-flexible-schedule-documents]]
- depends_on → [[postgres-primary-cluster]]
