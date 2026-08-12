# Trellis

Local-first memory graph for coding agents. An Obsidian-compatible markdown vault with a typed graph over it, served through one stdio MCP server that works in Claude Code, Codex, Cursor, Windsurf — anything that speaks MCP.

No server. No accounts. No API keys. No telemetry. Memory of your codebase never leaves your disk.

*(“Trellis” is a working codename.)*

## Layout

```
packages/core   vault I/O · typed graph · pure-TS BM25 · budgeted retrieval
packages/mcp    stdio MCP server: memory_search / memory_expand / memory_write / memory_link
scripts/        build · smoke (stdio E2E) · seed · wire (agent configs)
docs/           VAULT-FORMAT.md
.trellis/       this repo's own memory, dogfooded
```

Full plan with phase gates: `Trellis-Build-Plan.pdf`.

## Quickstart

```bash
npm install
npm run build        # bundles a single self-contained dist/server.js
npm run smoke        # drives the server over stdio like a real client
npm test             # unit tests
npm run wire -- .            # .mcp.json for Claude Code in this project
npm run wire -- --codex      # register globally for Codex (backs up config.toml)
```

## How it works

- **Storage**: markdown + YAML frontmatter + `[[wikilinks]]` (`docs/VAULT-FORMAT.md`). The vault is the source of truth; every index is disposable.
- **Retrieval**: BM25 seeds → 2-hop graph expansion → rank by relevance × confidence × recency → hard token budget (default 1500). Search returns ~15-token skeletons; `memory_expand` fetches bodies on demand.
- **Self-correction**: `supersedes` hides replaced decisions from retrieval; near-duplicates are flagged at write time; confidence decays unless re-confirmed.
- **Write-back**: tool descriptions + session-state footers on every response (the two channels every MCP client gets). Rules blocks, hooks, and the session journal land in Phase 2.
