# Trellis Memory Graph

VS Code companion for [Trellis](https://github.com/HadiAbbasIsDev/Trellis) — a local-first
memory graph for coding agents. Everything runs in-process against the vault at
`<first workspace folder>/.trellis`; no server, no accounts, no telemetry.

## What you get

- **Status bar**: `N nodes · Xk tok today` — node count from the vault, token spend
  summed from today's entries in `.trellis/.stats/log.jsonl`. Updates live as agents
  write memory. Click it to open the graph.
- **Trellis: Show Memory Graph** — interactive force-directed canvas of the vault:
  typed edges with arrowheads, implicit `[[wikilink]]` edges dashed, superseded nodes
  dimmed, search filter, per-type legend toggles, click a node for full detail.
  Re-renders automatically when the vault changes, matching your editor theme.
- **Trellis: Wire This Project** — registers the Trellis MCP server (plus hooks) for
  the current workspace via the repo's `scripts/wire.mjs`.
- **Trellis: Open Vault Folder** — reveals `.trellis/` in your file manager.

## Honest limitations (v0.1.0)

- The wire command shells out to the Trellis repo's `scripts/wire.mjs` at a hard-coded
  development path, so the packaged `.vsix` only fully works on a machine with that
  checkout. The graph and status bar are self-contained (`@trellis/core` is bundled).
- Only the first workspace folder is scanned for a vault.

## Build & install

```bash
node build.mjs                                # bundles src -> dist/extension.js
npx @vscode/vsce package --no-dependencies    # -> trellis-memory-0.1.0.vsix
code --install-extension trellis-memory-0.1.0.vsix
```
