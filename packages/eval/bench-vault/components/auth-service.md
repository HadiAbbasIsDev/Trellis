---
id: auth-service
type: component
title: Auth service
summary: Issues and validates sessions; owns sign-in, SSO via SAML, and the
  permissions model.
confidence: 0.9
tags:
  - auth
created: 2025-05-22T12:00:00.000Z
updated: 2025-05-22T12:00:00.000Z
last_confirmed: 2025-05-22T12:00:00.000Z
edges: []
---

Session records live in Redis with a Postgres fallback. SAML metadata is stored per tenant.
