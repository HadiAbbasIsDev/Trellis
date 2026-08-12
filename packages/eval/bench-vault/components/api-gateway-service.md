---
id: api-gateway-service
type: component
title: API gateway service
summary: Fastify app terminating all public traffic; validates payloads with zod
  and enforces tenant scoping on every route.
confidence: 0.9
tags:
  - api
created: 2025-05-20T12:00:00.000Z
updated: 2025-05-20T12:00:00.000Z
last_confirmed: 2025-05-20T12:00:00.000Z
edges:
  - rel: implements
    to: fastify-over-express-for-api
  - rel: depends_on
    to: auth-service
---

Every handler receives a request-scoped tenant context; forgetting it fails the request in middleware, not in review.

<!-- trellis:relations -->
## Relations
- implements → [[fastify-over-express-for-api]]
- depends_on → [[auth-service]]
