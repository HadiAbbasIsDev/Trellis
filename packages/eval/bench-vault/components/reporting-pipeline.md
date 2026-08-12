---
id: reporting-pipeline
type: component
title: Reporting pipeline
summary: Builds wage and coverage exports nightly per tenant, reading only from
  the replica.
confidence: 0.9
tags:
  - reporting
created: 2025-08-12T12:00:00.000Z
updated: 2025-08-12T12:00:00.000Z
last_confirmed: 2025-08-12T12:00:00.000Z
edges:
  - rel: depends_on
    to: read-replica-for-reporting-queries
  - rel: relates_to
    to: payroll-export
---

Long scans are fine here; the replica absorbs them.

<!-- trellis:relations -->
## Relations
- depends_on → [[read-replica-for-reporting-queries]]
- relates_to → [[payroll-export]]
