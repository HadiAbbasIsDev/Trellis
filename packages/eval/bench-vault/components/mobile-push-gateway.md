---
id: mobile-push-gateway
type: component
title: Mobile push gateway
summary: Sends APNs and FCM notifications; device tokens registered at sign-in.
confidence: 0.85
tags:
  - mobile
created: 2025-10-01T12:00:00.000Z
updated: 2025-10-01T12:00:00.000Z
last_confirmed: 2025-10-01T12:00:00.000Z
edges:
  - rel: relates_to
    to: notification-worker
---

Invalid-token feedback prunes the device table daily.

<!-- trellis:relations -->
## Relations
- relates_to → [[notification-worker]]
