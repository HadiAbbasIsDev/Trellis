---
id: soc2-audit-trail-for-admin-actions
type: constraint
title: SOC 2 audit trail for admin actions
summary: "Every admin mutation writes an audit row: actor, tenant, action,
  before and after values."
confidence: 1
tags:
  - compliance
created: 2026-02-11T12:00:00.000Z
updated: 2026-02-11T12:00:00.000Z
last_confirmed: 2026-02-11T12:00:00.000Z
edges: []
---

Auditors ask for the trail every cycle. The audit write happens in the same transaction as the mutation — a mutation without its audit row must not commit.
