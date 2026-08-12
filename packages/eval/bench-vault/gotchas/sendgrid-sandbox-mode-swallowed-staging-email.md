---
id: sendgrid-sandbox-mode-swallowed-staging-email
type: gotcha
title: SendGrid sandbox mode swallowed staging email
summary: "Staging silently sent nothing: SENDGRID_SANDBOX was left on in the
  task definition; alerts now fail loud when sandbox is enabled outside prod."
confidence: 0.9
tags:
  - email
  - deploy
created: 2026-07-10T12:00:00.000Z
updated: 2026-07-10T12:00:00.000Z
last_confirmed: 2026-07-10T12:00:00.000Z
edges:
  - rel: relates_to
    to: sendgrid-for-transactional-email
---

Sandbox mode accepts the send and delivers nothing, so every code path looked green.

<!-- trellis:relations -->
## Relations
- relates_to → [[sendgrid-for-transactional-email]]
