---
id: notification-worker
type: component
title: Notification worker
summary: BullMQ consumer that sends upcoming-rota reminders and swap alerts over
  email and push.
confidence: 0.9
tags:
  - workers
created: 2025-07-02T12:00:00.000Z
updated: 2025-07-02T12:00:00.000Z
last_confirmed: 2025-07-02T12:00:00.000Z
edges:
  - rel: depends_on
    to: bullmq-on-redis-for-background-jobs
  - rel: depends_on
    to: sendgrid-for-transactional-email
  - rel: relates_to
    to: swap-request
---

Sends in per-tenant batches and respects each user's quiet hours.

<!-- trellis:relations -->
## Relations
- depends_on → [[bullmq-on-redis-for-background-jobs]]
- depends_on → [[sendgrid-for-transactional-email]]
- relates_to → [[swap-request]]
