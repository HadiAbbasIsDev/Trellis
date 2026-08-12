/**
 * Wire the built trellis server into agent configs.
 *
 *   node scripts/wire.mjs <projectDir>                  # .mcp.json + rules blocks in CLAUDE.md / AGENTS.md
 *   node scripts/wire.mjs <projectDir> --cursor-rules   # + .cursor/rules/trellis.mdc (alwaysApply)
 *   node scripts/wire.mjs <projectDir> --windsurf       # + managed block in .windsurfrules
 *   node scripts/wire.mjs <projectDir> --hooks          # + Claude Code Stop/PostToolUse hooks in .claude/settings.json
 *   node scripts/wire.mjs --codex                       # ~/.codex/config.toml (global, backs up first)
 *
 * The wiring logic itself lives in packages/wiring (shared with the VS Code
 * extension — one implementation, zero drift); this file is the CLI shell
 * plus the Codex global config, which only makes sense from a checkout.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverPath = path.join(root, 'packages/mcp/dist/server.js');
const wiringPath = path.join(root, 'packages/wiring/dist/index.cjs');

if (!fs.existsSync(serverPath) || !fs.existsSync(wiringPath)) {
  console.error('build artifacts missing — run `npm run build` first');
  process.exit(1);
}

const require = createRequire(import.meta.url);
const wiring = require(wiringPath);

const args = process.argv.slice(2);
const wantCodex = args.includes('--codex');
const wantCursor = args.includes('--cursor-rules');
const wantWindsurf = args.includes('--windsurf');
const wantHooks = args.includes('--hooks');
const projectDir = args.find((a) => !a.startsWith('--'));

if (projectDir) {
  const outcome = wiring.wireProject(path.resolve(projectDir), {
    serverPath,
    stopScript: path.join(root, 'scripts/hooks/stop-guard.mjs'),
    journalScript: path.join(root, 'scripts/hooks/journal.mjs'),
    cursorRules: wantCursor,
    windsurf: wantWindsurf,
    hooks: wantHooks,
  });
  for (const m of outcome.messages) console.log(m);
  for (const e of outcome.errors) console.error(e);
  // refusals must be visible to scripts/CI, not just stderr readers
  if (outcome.errors.length > 0) process.exitCode = 1;
} else if (wantCursor || wantWindsurf || wantHooks) {
  console.error('--cursor-rules / --windsurf / --hooks need a projectDir: node scripts/wire.mjs <projectDir> [flags]');
  process.exit(1);
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
  console.log('usage: node scripts/wire.mjs [projectDir] [--codex] [--cursor-rules] [--windsurf] [--hooks]');
}
