---
id: coverage-gap
type: entity
title: Coverage gap
summary: A time range where scheduled staffing falls below the template's minimum.
confidence: 0.9
tags:
  - domain
created: 2025-09-15T12:00:00.000Z
updated: 2025-09-15T12:00:00.000Z
last_confirmed: 2025-09-15T12:00:00.000Z
edges:
  - rel: relates_to
    to: scheduler-engine
---

Computed by [[scheduler-engine]] on every publish and shown as a red band in the editor.

<!-- trellis:relations -->
## Relations
- relates_to → [[scheduler-engine]]
