---
id: blue-green-deploys-on-ecs
type: decision
title: Blue-green deploys on ECS
summary: Two ECS services swap behind the ALB; a bad release rolls back by
  flipping the target group, not by rebuilding.
confidence: 0.9
tags:
  - deploy
created: 2026-03-14T12:00:00.000Z
updated: 2026-03-14T12:00:00.000Z
last_confirmed: 2026-03-14T12:00:00.000Z
edges:
  - rel: observed_in
    to: session-2026-03-14-deploy-pipeline
---

Cutover is a target-group flip, so rollback is seconds. Set up in [[session-2026-03-14-deploy-pipeline]].

<!-- trellis:relations -->
## Relations
- observed_in → [[session-2026-03-14-deploy-pipeline]]
