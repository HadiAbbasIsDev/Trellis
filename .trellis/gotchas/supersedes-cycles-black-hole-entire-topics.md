---
id: supersedes-cycles-black-hole-entire-topics
type: gotcha
title: Supersedes cycles black-hole entire topics
summary: A mutual supersedes (two concurrent agents each superseding the other)
  hid BOTH nodes from every search with no warning.
confidence: 0.8
tags:
  - graph
  - review-fleet
created: 2026-08-12T08:57:33.369Z
updated: 2026-08-12T08:57:33.369Z
last_confirmed: 2026-08-12T08:57:33.369Z
edges: []
---

Found by the Phase 0 adversarial fleet, proven by execution. Fix is two-layer: refuse cycle-creating links at the tool boundary (supersedesWouldCycle), and break pre-existing cycles deterministically in buildSupersededBy (newest updated wins, id tiebreak). Never trust a graph invariant you don't enforce at write AND repair at read. See [[five-channel-write-back-ladder]].
