# Wiring Trellis into your client

One stdio server, many clients. Everything below points the client at the same
artifact: `packages/mcp/dist/server.js` (run `npm run build` first — the file
is self-contained, zero runtime deps). Replace `<REPO>` with the absolute path
to this repo.

## Where the vault comes from

The server resolves its vault in this order: `--vault <dir>` arg →
`TRELLIS_VAULT` env → `<cwd>/.trellis`. Project-scoped registrations (Claude
Code `.mcp.json`, Cursor `.cursor/mcp.json`) launch the server in the project
directory, so the default just works. **Globally registered** servers (Codex,
Windsurf, Zed, Continue, Claude Code user scope) inherit whatever cwd the
client uses — pin the vault explicitly with `--vault` in `args` or
`TRELLIS_VAULT` in `env` unless you have verified your client launches MCP
servers in the project root.

## `wire.mjs` — the shortcut

`npm run wire` generates configs instead of you hand-editing them. It merges,
never clobbers, and backs up before touching global files:

| Invocation | Writes | Status |
|---|---|---|
| `npm run wire -- <projectDir>` | `.mcp.json` for Claude Code + marked Trellis rules blocks in `CLAUDE.md` / `AGENTS.md` | shipped |
| `npm run wire -- --codex` | `[mcp_servers.trellis]` in `~/.codex/config.toml` (backs up first) | shipped |
| `npm run wire -- <projectDir> --hooks` | Claude Code Stop + PostToolUse (journal) hooks in `.claude/settings.json` | shipped |
| `npm run wire -- <projectDir> --cursor-rules` | `.cursor/rules/trellis.mdc` (alwaysApply; add `.cursor/mcp.json` by hand from the Cursor section below) | shipped |
| `npm run wire -- <projectDir> --windsurf` | managed rules block in `<project>/.windsurfrules` (MCP config itself is manual, see Windsurf section) | shipped |

## Claude Code

**Project scope** (recommended — checked into the repo, works for everyone who
clones it):

```bash
npm run wire -- .        # writes .mcp.json; picked up on the next session
```

Produces:

```json
{
  "mcpServers": {
    "trellis": { "command": "node", "args": ["<REPO>/packages/mcp/dist/server.js"] }
  }
}
```

**User scope** (one registration, every project):

```bash
claude mcp add -s user trellis -- node <REPO>/packages/mcp/dist/server.js
```

User-scoped servers follow the session's project directory, so each project
gets its own `.trellis/` vault automatically. Verify with `claude mcp list`.

## Codex

```bash
npm run wire -- --codex   # appends to ~/.codex/config.toml, backs up first
```

Or by hand in `~/.codex/config.toml`:

```toml
[mcp_servers.trellis]
command = "node"
args = ["<REPO>/packages/mcp/dist/server.js"]
```

This registration is global; add `"--vault", "/path/to/project/.trellis"` to
`args` if Codex does not launch servers in your project root.

## Cursor

Project file `.cursor/mcp.json` (same shape as Claude Code's):

```json
{
  "mcpServers": {
    "trellis": { "command": "node", "args": ["<REPO>/packages/mcp/dist/server.js"] }
  }
}
```

Cursor reads rules from `.cursor/rules/`. Drop this as
`.cursor/rules/trellis.mdc` so the agent actually *uses* the tools:

```markdown
---
description: Trellis project memory — search before working, record while working
alwaysApply: true
---

- Call `memory_search` before starting any task; it is cheaper than re-deriving
  context from the codebase.
- Record durable facts with `memory_write` the moment you learn them:
  decisions + why, constraints, gotchas + fixes, user preferences.
- If a write warns of a near-duplicate, update that node instead of creating
  a near-copy.
```

Config format implemented; not yet exercised in a live Cursor session on this
machine.

## Windsurf

Global file `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "trellis": {
      "command": "node",
      "args": ["<REPO>/packages/mcp/dist/server.js", "--vault", "/path/to/project/.trellis"]
    }
  }
}
```

Global registration — pin the vault per the note at the top, or leave
`--vault` off only if your projects all keep `.trellis/` at the cwd Windsurf
launches from. Untested on this machine.

## Zed

In `settings.json` (`zed: open settings`):

```json
{
  "context_servers": {
    "trellis": {
      "source": "custom",
      "command": "node",
      "args": ["<REPO>/packages/mcp/dist/server.js", "--vault", "/path/to/project/.trellis"]
    }
  }
}
```

Older Zed builds use a nested shape instead:
`"trellis": { "command": { "path": "node", "args": [...] } }`. Untested on
this machine.

## Continue

In `~/.continue/config.yaml` (or a project `config.yaml`):

```yaml
mcpServers:
  - name: trellis
    command: node
    args:
      - <REPO>/packages/mcp/dist/server.js
      - --vault
      - /path/to/project/.trellis
```

Untested on this machine.

## Checking it worked

Any client: ask the agent to run `memory_search` for something you know is in
the vault. From the terminal, the smoke test drives the server exactly like a
client does:

```bash
npm run build && npm run smoke
```

And `npm run doctor` verifies the vault the server would serve is healthy.
