# Publishing Trellis

Exact steps the owner runs to ship a release. Nothing here is automated on
purpose — every push to a public registry is a human decision.

## Pre-flight checklist

Run from the repo root; every box must be checked before anything is pushed
anywhere.

- [ ] `npm run typecheck` — clean
- [ ] `npm test` — all unit tests green
- [ ] `npm run build && npm run smoke` — stdio end-to-end green
- [ ] `npm run doctor` — exit 0 on the dogfood vault (`.trellis/`)
- [ ] `npm run eval` — harness run on this machine, `eval-report.md` committed.
      Never publish a number that is not in that committed report.
- [ ] Version bumped **in lockstep** in root, `packages/core`, `packages/mcp`,
      and `packages/vscode-ext` (one version for the whole release)
- [ ] README claims match reality (compatibility matrix below included)
- [ ] `git tag vX.Y.Z && git push --tags`

## npm

### Names first — the `@trellis/*` scope is a placeholder

"Trellis" is a working codename and the `@trellis` npm scope almost certainly
belongs to someone else already (scopes are owned org/user names, not
first-come package names). Before anything else, check:

```bash
npm view @trellis/core        # E404 = name free, but the SCOPE must still be yours
npm whoami                    # the scope you can always publish under is @<this>
```

If `@trellis` is not claimable as an org on npmjs.com, pick one of:

- `@hadiabbas/trellis-core` and `@hadiabbas/trellis-mcp` (your user scope —
  always works, `--access public` required)
- an unscoped name that is actually free, e.g. `trellis-memory-mcp`
  (`npm view <name>` returns E404)

Renames touch `packages/*/package.json` (`name`, and the `@trellis/core`
dependency inside `@trellis/mcp`), `scripts/build.mjs` (esbuild alias),
`vitest.config.ts`, and `tsconfig.json` paths. Do them in one commit.

### Un-private and fill in publish metadata

Both workspace packages currently carry `"private": true` — that is the safety
catch. Per package (`packages/core`, `packages/mcp`):

1. Remove `"private": true`.
2. Add the fields npm needs and users expect: `license: "MIT"`, `repository`,
   `files` (ship `dist`/`src` deliberately, not the whole folder), and for the
   MCP server a `bin` entry pointing at the bundled `dist/server.js` so
   `npx <pkg>` starts the server.

The **root** `package.json` stays `"private": true` forever — the workspace
wrapper is never published.

### Publish

```bash
npm login                                  # once per machine
npm run build                              # dist/server.js is the artifact
cd packages/core && npm publish --access public
cd ../mcp       && npm publish --access public
```

Publish `core` before `mcp` (mcp depends on it). `--access public` is
mandatory for scoped packages — scoped packages default to private and the
publish fails without it.

## VS Code Marketplace

The extension lives in `packages/vscode-ext` (built and packaged with `vsce`).

1. **Publisher** (once): create one at
   <https://marketplace.visualstudio.com/manage>. The publisher id goes into
   `packages/vscode-ext/package.json` as `"publisher"`.
2. **PAT** (expires, so occasionally again): at <https://dev.azure.com>,
   create a Personal Access Token with organization set to
   *All accessible organizations* and scope *Marketplace → Manage*.
3. **Package and publish**:

```bash
npm i -g @vscode/vsce
cd packages/vscode-ext
vsce package                # produces trellis-<version>.vsix — sanity-install this first
vsce login <publisher-id>   # paste the PAT
vsce publish
```

Sanity-install the `.vsix` locally before publishing:
`code --install-extension trellis-<version>.vsix`.

## Open VSX (Cursor, Windsurf, VSCodium users)

Cursor and Windsurf install extensions from Open VSX, not the Microsoft
marketplace — skipping this step cuts off the two most memory-hungry client
audiences.

1. Sign in at <https://open-vsx.org> with GitHub, sign the Eclipse publisher
   agreement (required before the first publish), create an access token in
   your profile settings.
2. Publish the **same** `.vsix` that went to the Microsoft marketplace:

```bash
npm i -g ovsx
ovsx create-namespace <publisher-id> -p <token>   # once
ovsx publish packages/vscode-ext/trellis-<version>.vsix -p <token>
```

## Compatibility matrix

Honest status as of this machine, this release. Copy this table into release
notes; update it only from first-hand evidence.

| Client | Wiring | Status |
|---|---|---|
| Claude Code | `.mcp.json` via `npm run wire -- <projectDir>` | **Wired + smoke-tested here** — `scripts/smoke.mjs` drives the real server over stdio, and this repo dogfoods it |
| Codex | `~/.codex/config.toml` via `npm run wire -- --codex` | **Config wired here, protocol-level tested** — same stdio server the smoke test exercises; not exercised from inside a live Codex session on this machine |
| Cursor | `.cursor/mcp.json` + `.cursor/rules/trellis.mdc` (`--cursor-rules`) | Config format implemented; **UNTESTED on this machine** |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` (`--windsurf`) | Config format implemented; **UNTESTED on this machine** |
| Zed | `settings.json` → `context_servers` (manual, see `docs/WIRING.md`) | Config format documented; **UNTESTED on this machine** |
| Continue | `config.yaml` → `mcpServers` (manual, see `docs/WIRING.md`) | Config format documented; **UNTESTED on this machine** |

The server itself is client-agnostic stdio MCP — the untested rows are about
each client's config plumbing and rules-file conventions, not the protocol.

## What never ships

No telemetry, no account requirement, no API keys, no server component, no
native dependencies. If a release step would add any of these, the step is
wrong. This is product law, and it is also the marketing claim — keep it true.
