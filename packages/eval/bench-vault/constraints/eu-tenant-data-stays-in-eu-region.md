---
id: eu-tenant-data-stays-in-eu-region
type: constraint
title: EU tenant data stays in the EU region
summary: EU tenants are pinned to the Frankfurt stack; their data never
  replicates to us-east.
confidence: 1
tags:
  - compliance
  - infra
created: 2026-05-20T12:00:00.000Z
updated: 2026-05-20T12:00:00.000Z
last_confirmed: 2026-05-20T12:00:00.000Z
edges: []
---

Enforced at signup: [[tenant-provisioner]] picks the stack from the billing address, and Frankfurt tenants never leave eu-central-1. Contract clause for two enterprise customers.
