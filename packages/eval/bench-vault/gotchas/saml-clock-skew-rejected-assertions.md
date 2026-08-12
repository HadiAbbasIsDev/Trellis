---
id: saml-clock-skew-rejected-assertions
type: gotcha
title: SAML clock skew rejected assertions
summary: A customer IdP ran 90 seconds fast and assertions failed NotBefore
  checks; we now allow 120 seconds of skew.
confidence: 0.9
tags:
  - auth
created: 2026-06-17T12:00:00.000Z
updated: 2026-06-17T12:00:00.000Z
last_confirmed: 2026-06-17T12:00:00.000Z
edges:
  - rel: relates_to
    to: auth-service
---

Their sign-ins failed only in the morning, when the IdP drifted before its sync. Skew tolerance is per-tenant configurable now.

<!-- trellis:relations -->
## Relations
- relates_to → [[auth-service]]
