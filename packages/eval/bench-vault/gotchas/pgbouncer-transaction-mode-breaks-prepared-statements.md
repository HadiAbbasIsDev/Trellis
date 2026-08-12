---
id: pgbouncer-transaction-mode-breaks-prepared-statements
type: gotcha
title: PgBouncer transaction mode breaks prepared statements
summary: PgBouncer in transaction mode broke Kysely's prepared statements;
  disable the statement cache or use session mode.
confidence: 0.95
tags:
  - storage
  - infra
created: 2026-03-25T12:00:00.000Z
updated: 2026-03-25T12:00:00.000Z
last_confirmed: 2026-03-25T12:00:00.000Z
edges:
  - rel: relates_to
    to: kysely-over-prisma-for-database-access
  - rel: relates_to
    to: postgres-primary-cluster
---

Errors surfaced as "prepared statement s0 does not exist" only under load, when connections started being reused across clients.

<!-- trellis:relations -->
## Relations
- relates_to → [[kysely-over-prisma-for-database-access]]
- relates_to → [[postgres-primary-cluster]]
