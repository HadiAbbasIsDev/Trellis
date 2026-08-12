---
id: dst-change-fired-rota-reminders-twice
type: gotcha
title: DST change fired rota reminders twice
summary: The spring daylight saving transition fired duplicate reminders; the
  job cron ran in local time — schedule cron in UTC and derive local at render.
confidence: 0.95
tags:
  - workers
  - time
created: 2026-05-07T12:00:00.000Z
updated: 2026-05-07T12:00:00.000Z
last_confirmed: 2026-05-07T12:00:00.000Z
edges:
  - rel: observed_in
    to: session-2026-05-07-dst-incident
  - rel: relates_to
    to: notification-worker
---

Postmortem in [[session-2026-05-07-dst-incident]]. The repeated hour re-matched the cron expression.

<!-- trellis:relations -->
## Relations
- observed_in → [[session-2026-05-07-dst-incident]]
- relates_to → [[notification-worker]]
