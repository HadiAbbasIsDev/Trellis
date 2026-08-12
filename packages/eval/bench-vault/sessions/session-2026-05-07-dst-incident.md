---
id: session-2026-05-07-dst-incident
type: session
title: "Session 2026-05-07: DST incident"
summary: "Postmortem: duplicate reminders on the daylight saving change; job
  cron moved to UTC."
confidence: 0.8
tags:
  - workers
  - incident
created: 2026-05-07T12:00:00.000Z
updated: 2026-05-07T12:00:00.000Z
last_confirmed: 2026-05-07T12:00:00.000Z
edges: []
---

Affected 212 tenants in Europe. Added a canary that runs the cron matcher across the next DST boundary in CI.
