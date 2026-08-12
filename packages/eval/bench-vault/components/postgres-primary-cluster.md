---
id: postgres-primary-cluster
type: component
title: Postgres primary cluster
summary: RDS Postgres 16 primary with one replica; all tenant data lives here.
confidence: 0.9
tags:
  - infra
  - storage
created: 2025-05-10T12:00:00.000Z
updated: 2025-05-10T12:00:00.000Z
last_confirmed: 2025-05-10T12:00:00.000Z
edges: []
---

PgBouncer fronts it in transaction mode. Connection budget: 80 for the API, 40 for workers.
