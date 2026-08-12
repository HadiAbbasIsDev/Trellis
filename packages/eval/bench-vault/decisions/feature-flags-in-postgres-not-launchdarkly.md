---
id: feature-flags-in-postgres-not-launchdarkly
type: decision
title: Feature flags in Postgres, not LaunchDarkly
summary: Feature flags live in a Postgres table behind a 30-second cache;
  LaunchDarkly cost and SDK weight were not justified.
confidence: 0.85
tags:
  - stack
created: 2025-09-09T12:00:00.000Z
updated: 2025-09-09T12:00:00.000Z
last_confirmed: 2025-09-09T12:00:00.000Z
edges: []
---

A flags table plus one admin page covers per-tenant rollout. Revisit only if we need percentage rollouts with client-side evaluation.
