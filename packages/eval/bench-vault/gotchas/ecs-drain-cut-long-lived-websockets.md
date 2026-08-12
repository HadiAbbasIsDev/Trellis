---
id: ecs-drain-cut-long-lived-websockets
type: gotcha
title: ECS drain cut long-lived websockets
summary: The default 30-second ECS deregistration drain cut long-lived websocket
  connections mid rota edit; raised drain to 300 seconds and added client
  resume.
confidence: 0.95
tags:
  - deploy
created: 2026-03-14T12:00:00.000Z
updated: 2026-03-14T12:00:00.000Z
last_confirmed: 2026-03-14T12:00:00.000Z
edges:
  - rel: observed_in
    to: session-2026-03-14-deploy-pipeline
  - rel: relates_to
    to: blue-green-deploys-on-ecs
---

Managers lost unsaved edits on every deploy until the client learned to resume. Found during [[session-2026-03-14-deploy-pipeline]].

<!-- trellis:relations -->
## Relations
- observed_in → [[session-2026-03-14-deploy-pipeline]]
- relates_to → [[blue-green-deploys-on-ecs]]
