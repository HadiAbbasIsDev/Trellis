---
id: read-replica-for-reporting-queries
type: decision
title: Read replica for reporting queries
summary: Reporting reads hit a Postgres replica so nightly payroll exports stop
  starving the primary of IO.
confidence: 0.9
tags:
  - storage
  - performance
created: 2026-02-24T12:00:00.000Z
updated: 2026-02-24T12:00:00.000Z
last_confirmed: 2026-02-24T12:00:00.000Z
edges:
  - rel: depends_on
    to: postgres-primary-cluster
---

The payroll export scan starved the primary and p95 write latency tripled during the nightly window. Replica lag under ten seconds is acceptable for reports.

<!-- trellis:relations -->
## Relations
- depends_on → [[postgres-primary-cluster]]
