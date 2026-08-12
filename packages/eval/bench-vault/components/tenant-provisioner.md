---
id: tenant-provisioner
type: component
title: Tenant provisioner
summary: Creates the schema, seat allocation, and default rota templates when a
  new organization signs up.
confidence: 0.9
tags:
  - core
created: 2025-07-20T12:00:00.000Z
updated: 2025-07-20T12:00:00.000Z
last_confirmed: 2025-07-20T12:00:00.000Z
edges:
  - rel: relates_to
    to: tenant
---

Runs as a saga; every step retries independently and a failed step never leaves a half-created org visible.

<!-- trellis:relations -->
## Relations
- relates_to → [[tenant]]
