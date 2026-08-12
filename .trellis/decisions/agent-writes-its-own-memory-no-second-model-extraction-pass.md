---
id: agent-writes-its-own-memory-no-second-model-extraction-pass
type: decision
title: Agent writes its own memory; no second-model extraction pass
summary: No API keys and no shelling out to CLIs — the agent records facts via
  MCP tools as it works.
confidence: 0.8
tags:
  - architecture
created: 2026-08-12T08:34:10.310Z
updated: 2026-08-12T08:34:10.310Z
last_confirmed: 2026-08-12T08:34:10.310Z
edges:
  - rel: depends_on
    to: five-channel-write-back-ladder
---

User explicitly rejected an extraction pass (even keyless CLI shelling) as friction. This makes write-back reliability THE core problem — mitigated by [[five-channel-write-back-ladder]].

<!-- trellis:relations -->
## Relations
- depends_on → [[five-channel-write-back-ladder]]
