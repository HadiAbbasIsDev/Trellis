---
id: kysely-camelcase-plugin-breaks-raw-sql
type: gotcha
title: Kysely CamelCasePlugin breaks raw SQL
summary: CamelCasePlugin rewrote column names inside sql template literals; raw
  fragments must use snake_case explicitly.
confidence: 0.9
tags:
  - storage
created: 2026-04-15T12:00:00.000Z
updated: 2026-04-15T12:00:00.000Z
last_confirmed: 2026-04-15T12:00:00.000Z
edges:
  - rel: relates_to
    to: kysely-over-prisma-for-database-access
---

The plugin only translates the query builder layer — raw sql`` strings pass through, so mixed casing returned undefined columns at runtime.

<!-- trellis:relations -->
## Relations
- relates_to → [[kysely-over-prisma-for-database-access]]
