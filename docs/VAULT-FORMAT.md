# Trellis vault format

A vault is a folder of markdown files — Obsidian-compatible, git-diffable, readable without any tooling. Default location: `.trellis/` in the project root (override with `TRELLIS_VAULT` env or `--vault` flag). Open it as an Obsidian vault to get the graph view for free (on Linux, press `Ctrl+H` in Obsidian's folder picker to show dot-folders).

## Layout

```
.trellis/
  decisions/      constraints/    components/
  entities/       preferences/    gotchas/       sessions/
```

One file per node: `<type-folder>/<id>.md`, where `id` is a unique kebab-case slug (also the wikilink target). Files without a `type:` frontmatter key (READMEs, stray notes) are ignored.

## Node file

```markdown
---
id: pure-ts-bm25-index-instead-of-sqlite
type: decision
title: Pure-TS BM25 index instead of SQLite
summary: No native prebuilds ends the platform-matrix install failures.
confidence: 0.9
tags: [stack]
created: 2026-08-12T10:00:00.000Z
updated: 2026-08-12T10:00:00.000Z
last_confirmed: 2026-08-12T10:00:00.000Z
edges:
  - rel: depends_on
    to: local-first-constraint
---

Details in markdown. Link freely with [[wikilinks]] — they become
implicit graph edges when the target exists.

<!-- trellis:relations -->
## Relations
- depends_on → [[local-first-constraint]]
```

Frontmatter `edges` are authoritative for the machine. The `## Relations` section below the marker comment is **generated on every write** so Obsidian's graph renders typed edges as real links — never edit it by hand; edits above the marker are preserved.

## Types

| Node type | Holds |
|---|---|
| `decision` | a choice made and its reasoning |
| `constraint` | a rule the work must respect |
| `component` | a part of the system and its role |
| `entity` | domain vocabulary |
| `preference` | how the user wants work done |
| `gotcha` | a failure and what fixed it |
| `session` | provenance: what a work session did |

| Edge | Meaning |
|---|---|
| `supersedes` | this node replaces the target; the target is hidden from retrieval and searches redirect here |
| `contradicts` | flagged conflict, surfaced instead of silently stored |
| `depends_on` / `implements` | structure |
| `observed_in` | provenance back to a session node |
| `relates_to` | weakest link |

## Semantics worth knowing

- `confidence` (0–1) and recency (`last_confirmed`, 180-day half-life, floored at 0.25) multiply into every retrieval score. Old unconfirmed facts fade; they never vanish.
- `supersedes` chains are followed to the newest node. A superseded node is structurally unretrievable — this is the defense against acting on reversed decisions.
- Near-duplicate writes (Jaccard ≥ 0.5 over title+summary tokens, same type) are warned about at write time with the existing node's id.
- Writes are atomic (tmp file + rename); ids are globally unique across types.
