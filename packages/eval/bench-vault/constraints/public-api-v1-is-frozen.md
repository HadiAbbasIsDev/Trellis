---
id: public-api-v1-is-frozen
type: constraint
title: Public API v1 is frozen
summary: No breaking updates to /v1 endpoints; additive fields only, breaking
  shape moves wait for /v2.
confidence: 1
tags:
  - api
  - compat
created: 2026-01-28T12:00:00.000Z
updated: 2026-01-28T12:00:00.000Z
last_confirmed: 2026-01-28T12:00:00.000Z
edges: []
---

Three payroll partners integrate against /v1 and upgrade slowly. Removing or renaming a field is an incident, not a refactor.
