---
id: pii-never-in-logs-or-analytics
type: constraint
title: PII never reaches logs or analytics
summary: Employee names, emails, and phone numbers must never reach logs or
  third-party analytics.
confidence: 1
tags:
  - privacy
  - compliance
created: 2025-08-20T12:00:00.000Z
updated: 2025-08-20T12:00:00.000Z
last_confirmed: 2025-08-20T12:00:00.000Z
edges: []
---

Applies to error breadcrumbs and product analytics events too. Redact at the logger, not at call sites — call sites forget.
