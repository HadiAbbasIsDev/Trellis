---
id: pure-ts-bm25-index-instead-of-sqlite
type: decision
title: Pure-TS BM25 index instead of SQLite
summary: No native prebuilds ends the platform-matrix install failures; markdown
  vault stays the source of truth.
confidence: 0.8
tags:
  - stack
created: 2026-08-12T08:34:10.310Z
updated: 2026-08-12T08:34:10.310Z
last_confirmed: 2026-08-12T08:34:10.310Z
edges:
  - rel: depends_on
    to: local-first-no-server-no-accounts-no-keys-no-telemetry
---

better-sqlite3/sqlite-vec need prebuilds for 5 platforms — historically the top source of "extension will not install". A ~150-line inverted index is instant at vault scale and rebuildable from markdown at any time, so a later swap is a re-index, not a migration. See [[local-first-no-server-no-accounts-no-keys-no-telemetry]].

<!-- trellis:relations -->
## Relations
- depends_on → [[local-first-no-server-no-accounts-no-keys-no-telemetry]]
