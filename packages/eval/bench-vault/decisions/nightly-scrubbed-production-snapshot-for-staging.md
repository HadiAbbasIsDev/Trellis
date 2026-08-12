---
id: nightly-scrubbed-production-snapshot-for-staging
type: decision
title: Nightly scrubbed production snapshot for staging
summary: Staging restores a nightly production snapshot with employee data
  masked during the restore.
confidence: 0.85
tags:
  - deploy
  - privacy
created: 2026-04-08T12:00:00.000Z
updated: 2026-04-08T12:00:00.000Z
last_confirmed: 2026-04-08T12:00:00.000Z
edges:
  - rel: relates_to
    to: pii-never-in-logs-or-analytics
---

Realistic data volume without the exposure; masking runs inside the restore job before the database accepts connections.

<!-- trellis:relations -->
## Relations
- relates_to → [[pii-never-in-logs-or-analytics]]
