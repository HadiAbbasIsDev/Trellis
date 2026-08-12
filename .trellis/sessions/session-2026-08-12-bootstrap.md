---
id: session-2026-08-12-bootstrap
type: session
title: "Session 2026-08-12: bootstrap"
summary: "Scaffolded the monorepo: core (vault/BM25/retrieval), MCP server with
  4 tools, smoke test, seed, wiring."
confidence: 0.8
tags: []
created: 2026-08-12T08:34:10.310Z
updated: 2026-08-12T09:30:04.747Z
last_confirmed: 2026-08-12T09:30:04.747Z
edges:
  - rel: observed_in
    to: supersedes-cycles-black-hole-entire-topics
  - rel: observed_in
    to: silent-parse-failures-turn-into-overwrite-data-loss
---

Phase 0 of the roadmap in Trellis-Build-Plan.pdf. Gate: a fact written in one session/client is retrieved in another, unprompted.

Same-day hardening: 7-agent adversarial fleet found 19 execution-proven bugs (3 data-loss). All fixed: cycle-safe supersedes, strict Relations stripping, reserved filenames, vault lock + in-process serialization, hard budget, superseded banners, unicode tokenizer. 70 unit tests + 16 smoke checks green.

Round 2 re-attack: 6 second-order holes proven and fixed (update-path clobber guard, relations regex strict rels + EOL targets, atomic lock steal + heartbeat + owned release, create-branch cycle check via prospective stub, forward-ref slugging). Round 3: exclusion held; fixed newline-target growth, lock starvation (15s wait), note reconciliation. Final: 76 unit tests, 16 smoke checks, attacker harness 80/80 zero overlaps.

<!-- trellis:relations -->
## Relations
- observed_in → [[supersedes-cycles-black-hole-entire-topics]]
- observed_in → [[silent-parse-failures-turn-into-overwrite-data-loss]]
