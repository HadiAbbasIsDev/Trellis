---
id: jwt-in-localstorage-for-spa-auth
type: decision
title: JWT in localStorage for SPA auth
summary: Keep the JWT in localStorage so the SPA can attach it as a bearer
  header; simplest thing that works across subdomains.
confidence: 0.8
tags:
  - auth
created: 2025-05-06T12:00:00.000Z
updated: 2025-05-06T12:00:00.000Z
last_confirmed: 2025-05-06T12:00:00.000Z
edges: []
---

Access token 15 min, refresh token 30 days, both in localStorage keyed per tenant.
