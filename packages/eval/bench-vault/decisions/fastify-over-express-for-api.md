---
id: fastify-over-express-for-api
type: decision
title: Fastify over Express for the API
summary: Fastify won on schema validation and roughly double the throughput of
  Express in our route benchmarks.
confidence: 0.9
tags:
  - stack
  - api
created: 2025-04-02T12:00:00.000Z
updated: 2025-04-02T12:00:00.000Z
last_confirmed: 2025-04-02T12:00:00.000Z
edges: []
---

JSON schema validation at the route boundary comes for free, and plugin encapsulation maps cleanly onto tenant scoping. Express middleware ordering bugs bit us twice in the prototype.
