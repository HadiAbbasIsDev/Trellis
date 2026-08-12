---
id: kysely-over-prisma-for-database-access
type: decision
title: Kysely over Prisma for database access
summary: Kysely gives typed SQL without Prisma's query engine binary and
  migration lock-in.
confidence: 0.85
tags:
  - stack
  - storage
created: 2025-08-05T12:00:00.000Z
updated: 2025-08-05T12:00:00.000Z
last_confirmed: 2025-08-05T12:00:00.000Z
edges: []
---

We write real SQL and keep the types. Prisma's engine added 50 MB to the image and its migration diffing fought our hand-written migrations.
