---
id: scheduler-engine
type: component
title: Scheduler engine
summary: Generates rota assignments from availability and labor rules; the core
  algorithm of the product.
confidence: 0.9
tags:
  - core
created: 2025-06-01T12:00:00.000Z
updated: 2025-06-01T12:00:00.000Z
last_confirmed: 2025-06-01T12:00:00.000Z
edges:
  - rel: depends_on
    to: postgres-primary-cluster
---

A constraint solver over availability windows. The hot path is pure functions so property tests can hammer it.

<!-- trellis:relations -->
## Relations
- depends_on → [[postgres-primary-cluster]]
