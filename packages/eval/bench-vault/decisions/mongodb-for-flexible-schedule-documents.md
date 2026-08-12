---
id: mongodb-for-flexible-schedule-documents
type: decision
title: MongoDB for flexible schedule documents
summary: Schedules vary wildly per tenant, so store them as MongoDB documents
  rather than forcing one relational shape.
confidence: 0.85
tags:
  - storage
  - mvp
created: 2025-06-03T12:00:00.000Z
updated: 2025-06-03T12:00:00.000Z
last_confirmed: 2025-06-03T12:00:00.000Z
edges: []
---

Every tenant configures different roles, breaks, and rules, and the MVP needs to ship. One document per [[rota]] keeps reads simple while the model is still moving.
