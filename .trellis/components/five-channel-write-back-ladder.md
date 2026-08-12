---
id: five-channel-write-back-ladder
type: component
title: Five-channel write-back ladder
summary: "Redundant channels get agents to write memory: tool descriptions,
  response footers, rules blocks, hooks, session journal."
confidence: 0.8
tags:
  - write-back
created: 2026-08-12T08:34:10.310Z
updated: 2026-08-12T08:34:10.310Z
last_confirmed: 2026-08-12T08:34:10.310Z
edges: []
---

Ordered universal → deep. (1) Tool descriptions load in every client unconditionally. (2) Session-state footers on every response are the only DYNAMIC universal channel — highest leverage. (3) Generated rules blocks in CLAUDE.md/AGENTS.md/.cursor/rules. (4) Claude Code Stop/PreCompact hooks. (5) Zero-LLM session journal as raw material. Rungs 1–2 ship in Phase 0 (packages/mcp/src/format.ts and the tool descriptions in server.ts).
