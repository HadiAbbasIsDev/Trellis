/**
 * Wire the built trellis server into agent configs.
 *
 *   node scripts/wire.mjs [projectDir]   # .mcp.json for Claude Code (project scope)
 *   node scripts/wire.mjs --codex        # ~/.codex/config.toml (global, backs up first)
 *   node scripts/wire.mjs [projectDir] --codex
 *
 * Merges, never clobbers: existing servers in either file are preserved.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverPath = path.join(root, 'packages/mcp/dist/server.js');

if (!fs.existsSync(serverPath)) {
  console.error('dist/server.js missing — run `npm run build` first');
  process.exit(1);
}

const args = process.argv.slice(2);
const wantCodex = args.includes('--codex');
const projectDir = args.find((a) => !a.startsWith('--'));

if (projectDir) {
  const dir = path.resolve(projectDir);
  const mcpPath = path.join(dir, '.mcp.json');
  let config = {};
  if (fs.existsSync(mcpPath)) {
    try {
      config = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
    } catch {
      console.error(`refusing to overwrite unparseable ${mcpPath}`);
      process.exit(1);
    }
  }
  config.mcpServers = config.mcpServers ?? {};
  config.mcpServers.trellis = { command: 'node', args: [serverPath] };
  fs.writeFileSync(mcpPath, JSON.stringify(config, null, 2) + '\n');
  console.log(`wrote ${mcpPath} (Claude Code picks it up on next session in that project)`);
}

if (wantCodex) {
  const tomlPath = path.join(os.homedir(), '.codex', 'config.toml');
  const block = [
    '',
    '[mcp_servers.trellis]',
    'command = "node"',
    `args = ["${serverPath}"]`,
    '',
  ].join('\n');
  let existing = '';
  if (fs.existsSync(tomlPath)) {
    existing = fs.readFileSync(tomlPath, 'utf8');
    if (/^\[mcp_servers\.trellis\]/m.test(existing)) {
      console.log(`${tomlPath} already has [mcp_servers.trellis] — left untouched`);
      process.exit(0);
    }
    fs.copyFileSync(tomlPath, `${tomlPath}.bak-trellis`);
    console.log(`backed up to ${tomlPath}.bak-trellis`);
  } else {
    fs.mkdirSync(path.dirname(tomlPath), { recursive: true });
  }
  fs.writeFileSync(tomlPath, existing + block);
  console.log(`appended [mcp_servers.trellis] to ${tomlPath}`);
}

if (!projectDir && !wantCodex) {
  console.log('usage: node scripts/wire.mjs [projectDir] [--codex]');
}
