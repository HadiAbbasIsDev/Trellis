---
id: httponly-session-cookies-replace-jwt-localstorage
type: decision
title: httpOnly session cookies replace JWT in localStorage
summary: Auth moved to httpOnly SameSite cookies; an XSS can no longer read
  localStorage and walk away with a JWT.
confidence: 0.95
tags:
  - auth
  - security
created: 2025-11-03T12:00:00.000Z
updated: 2025-11-03T12:00:00.000Z
last_confirmed: 2025-11-03T12:00:00.000Z
edges:
  - rel: supersedes
    to: jwt-in-localstorage-for-spa-auth
  - rel: observed_in
    to: session-2025-11-03-auth-migration
  - rel: depends_on
    to: auth-service
---

A pentest showed any injected script could read the JWT. Cookies with SameSite=Lax plus a CSRF header close that class of bug. Rolled out in [[session-2025-11-03-auth-migration]].

<!-- trellis:relations -->
## Relations
- supersedes → [[jwt-in-localstorage-for-spa-auth]]
- observed_in → [[session-2025-11-03-auth-migration]]
- depends_on → [[auth-service]]
