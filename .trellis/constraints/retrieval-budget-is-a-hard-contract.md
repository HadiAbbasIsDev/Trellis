---
id: retrieval-budget-is-a-hard-contract
type: constraint
title: Retrieval budget is a hard contract
summary: estimateTokens(response) <= budget_tokens must hold by construction;
  measured overhead, trim loop, verified in tests at the 100-token floor.
confidence: 0.8
tags:
  - retrieval
created: 2026-08-12T08:57:33.369Z
updated: 2026-08-12T08:57:33.369Z
last_confirmed: 2026-08-12T08:57:33.369Z
edges: []
---

The original flat 60-token reserve undershot and a 100-token budget produced 178 tokens. Everyone claims token savings; the meter only means something if the ceiling never lies.
