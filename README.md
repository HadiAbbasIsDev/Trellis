# Trellis

Local-first memory graph for coding agents. An Obsidian-compatible markdown vault with a typed graph over it, served through one stdio MCP server that works in Claude Code, Codex, Cursor, Windsurf — anything that speaks MCP.

No server. No accounts. No API keys. No telemetry. Memory of your codebase never leaves your disk.

*(“Trellis” is a working codename.)*

## Layout

```
packages/core        vault I/O · typed graph · pure-TS BM25 · budgeted retrieval
packages/mcp         stdio MCP server: memory_search / memory_expand / memory_write / memory_link
packages/vscode-ext  VS Code extension: graph panel + token-savings meter
scripts/             build · smoke (stdio E2E) · seed · wire (agent configs) · doctor · graph
docs/                VAULT-FORMAT.md · WIRING.md
.trellis/            this repo's own memory, dogfooded
```

Full plan with phase gates: `Trellis-Build-Plan.pdf`. Publishing steps and the honest client-compatibility matrix: `PUBLISHING.md`.

## Quickstart

```bash
npm install
npm run build        # bundles a single self-contained dist/server.js
npm run smoke        # drives the server over stdio like a real client
npm test             # unit tests
npm run wire -- .    # .mcp.json for Claude Code in this project
npm run graph        # interactive graph viewer → trellis-graph.html (zero deps)
```

## How it works

- **Storage**: markdown + YAML frontmatter + `[[wikilinks]]` (`docs/VAULT-FORMAT.md`). The vault is the source of truth; every index is disposable.
- **Retrieval**: BM25 seeds → 2-hop graph expansion → rank by relevance × confidence × recency → hard token budget (default 1500). Search returns ~15-token skeletons; `memory_expand` fetches bodies on demand.
- **Self-correction**: `supersedes` hides replaced decisions from retrieval; near-duplicates are flagged at write time; confidence decays unless re-confirmed.
- **Write-back**: five redundant channels get agents to actually record memory — tool descriptions and session-state footers (every MCP client gets these), generated rules blocks in `CLAUDE.md`/`AGENTS.md`/`.cursor/rules`, Claude Code Stop/PreCompact hooks, and the session journal.

## Wiring

`docs/WIRING.md` covers every client — Claude Code (project and user scope), Codex, Cursor, Windsurf, Zed, Continue — plus which `wire.mjs` flags generate the configs for you (`--codex`, `--hooks`, `--cursor-rules`, `--windsurf`) and when to pin the vault path explicitly.

## Doctor

```bash
npm run doctor            # tsx scripts/doctor.ts --vault <dir> [--fix]
```

Vault health check, CI-friendly (exit 1 while problems remain): broken/unparseable notes, duplicate ids, dangling edges, supersedes cycles, near-duplicate pairs, orphans, dot-dir sizes. `--fix` applies only safe repairs — deduping exact-duplicate edges and dropping dangling edges, each removal printed. It never touches note bodies or timestamps.

## Eval harness

```bash
npm run eval
```

Replays scripted sessions against a throwaway vault and measures what actually matters: does a fact written in one session surface in the next, and at what token cost. Results live in `eval-report.md` — that committed report is the only source for any number we claim.

## VS Code extension

`packages/vscode-ext` renders the live memory graph in a panel and meters tokens saved by budgeted retrieval versus raw-file context. Until it ships to the marketplaces, install from a local build:

```bash
cd packages/vscode-ext && vsce package
code --install-extension trellis-*.vsix
```
