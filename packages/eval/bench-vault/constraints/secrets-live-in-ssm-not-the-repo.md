---
id: secrets-live-in-ssm-not-the-repo
type: constraint
title: Secrets live in SSM, not the repo
summary: Secrets belong in AWS SSM Parameter Store; the repo and CI logs must
  never contain one.
confidence: 1
tags:
  - security
  - infra
created: 2025-07-15T12:00:00.000Z
updated: 2025-07-15T12:00:00.000Z
last_confirmed: 2025-07-15T12:00:00.000Z
edges: []
---

Task definitions reference SSM paths. A leaked value means rotation plus an incident write-up, even for staging.
