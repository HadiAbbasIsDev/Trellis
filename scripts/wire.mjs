/**
 * Wire the built trellis server into agent configs.
 *
 *   node scripts/wire.mjs <projectDir>                  # .mcp.json + rules blocks in CLAUDE.md / AGENTS.md
 *   node scripts/wire.mjs <projectDir> --cursor-rules   # + .cursor/rules/trellis.mdc (alwaysApply)
 *   node scripts/wire.mjs <projectDir> --windsurf       # + managed block in .windsurfrules
 *   node scripts/wire.mjs <projectDir> --hooks          # + Claude Code Stop/PostToolUse hooks in .claude/settings.json
 *   node scripts/wire.mjs --codex                       # ~/.codex/config.toml (global, backs up first)
 *
 * Merges, never clobbers: existing servers, settings keys, and user prose are
 * preserved. Rules text lives between '<!-- trellis:begin -->' and
 * '<!-- trellis:end -->' markers and ONLY that span is ever rewritten, so
 * re-running is always a no-op on an already-wired project.
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
const wantCursor = args.includes('--cursor-rules');
const wantWindsurf = args.includes('--windsurf');
const wantHooks = args.includes('--hooks');
const projectDir = args.find((a) => !a.startsWith('--'));

const BEGIN = '<!-- trellis:begin -->';
const END = '<!-- trellis:end -->';

// One rules text for every surface (CLAUDE.md, AGENTS.md, Cursor, Windsurf):
// the write-back behaviors are agent-agnostic, and a single source keeps the
// wording from drifting between tools.
const RULES_BODY = [
  '## Project memory (Trellis)',
  '',
  'This project has a persistent memory graph, served through MCP tools:',
  'memory_search / memory_expand / memory_write / memory_link.',
  '',
  '- CALL memory_search FIRST when starting any task — retrieving past context',
  '  is far cheaper than re-deriving it from the codebase.',
  '- Record durable facts with memory_write AT THE MOMENT they happen, not at',
  '  session end: decisions (and why), constraints, gotchas (failure + fix),',
  '  and user preferences about how to work.',
  '- Keep titles short and searchable; summaries one sentence.',
  '- When a decision replaces an earlier one, add a supersedes edge so the old',
  '  one stops surfacing.',
  '- Heed near-duplicate warnings from memory_write: update or link the',
  '  existing node instead of re-creating it.',
].join('\n');

/**
 * Find the char offsets of managed markers, IGNORING any that sit inside a
 * fenced code block — a user documenting the markers in a ``` fence must
 * never have their example prose treated as the managed span (bare indexOf
 * provably ate user content that way).
 */
function findMarkers(content) {
  let inFence = false;
  let offset = 0;
  let begin = -1;
  let end = -1;
  for (const line of content.split('\n')) {
    const stripped = line.replace(/\r$/, '');
    if (/^(```|~~~)/.test(stripped.trimStart())) inFence = !inFence;
    else if (!inFence) {
      if (begin === -1 && stripped.trim() === BEGIN) begin = offset + line.indexOf(BEGIN);
      else if (end === -1 && stripped.trim() === END) end = offset + line.indexOf(END);
    }
    offset += line.length + 1;
  }
  return { begin, end };
}

/**
 * Insert or replace the managed block in a prose file. Everything outside the
 * markers belongs to the user and is copied through byte-for-byte; the block
 * itself adopts the file's dominant line ending so CRLF files stay CRLF.
 */
function upsertRulesBlock(filePath) {
  let content = '';
  if (fs.existsSync(filePath)) content = fs.readFileSync(filePath, 'utf8');
  const crlf = (content.match(/\r\n/g) ?? []).length > (content.match(/(?<!\r)\n/g) ?? []).length;
  const eol = crlf ? '\r\n' : '\n';
  const managed = [BEGIN, ...RULES_BODY.split('\n'), END].join(eol);
  const { begin: b, end: e } = findMarkers(content);
  let next;
  if (b !== -1 && e !== -1 && e > b) {
    next = content.slice(0, b) + managed + content.slice(e + END.length);
  } else if (b !== -1 || e !== -1) {
    // Half a marker pair means a hand-edited mess; touching it risks eating
    // user prose, so leave the file alone and say why.
    console.error(`skipping ${filePath}: found a lone trellis marker — fix or remove it, then re-run`);
    return;
  } else if (content.length > 0) {
    next = content.replace(/\s*$/, eol + eol) + managed + eol;
  } else {
    next = managed + eol;
  }
  if (next !== content) {
    fs.writeFileSync(filePath, next);
    console.log(`wrote trellis block in ${filePath}`);
  } else {
    console.log(`${filePath} already up to date`);
  }
}

/** Cursor reads .mdc rule files; this one is namespaced to trellis, so a full overwrite is safe and trivially idempotent. */
function writeCursorRules(dir) {
  const ruleDir = path.join(dir, '.cursor', 'rules');
  fs.mkdirSync(ruleDir, { recursive: true });
  const rulePath = path.join(ruleDir, 'trellis.mdc');
  const content = [
    '---',
    'description: Trellis project memory — search it before tasks, write back as you work',
    'alwaysApply: true',
    '---',
    '',
    RULES_BODY,
    '',
  ].join('\n');
  if (fs.existsSync(rulePath) && fs.readFileSync(rulePath, 'utf8') === content) {
    console.log(`${rulePath} already up to date`);
  } else {
    fs.writeFileSync(rulePath, content);
    console.log(`wrote ${rulePath}`);
  }
}

/**
 * Merge trellis hooks into <project>/.claude/settings.json. Entries are
 * matched by their exact command string, so re-running never duplicates and
 * user-defined hooks in the same arrays are untouched.
 */
function wireHooks(dir) {
  const settingsDir = path.join(dir, '.claude');
  const settingsPath = path.join(settingsDir, 'settings.json');
  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch {
      // JSONC (comments) lands here too — Claude Code accepts comments but a
      // rewrite would destroy them, so hooks stay manual for such files.
      console.error(
        `skipping hooks: ${settingsPath} is not plain JSON (comments?) — add the hook entries manually, see docs/WIRING.md`,
      );
      return;
    }
  }
  const stopCmd = `node "${path.join(root, 'scripts/hooks/stop-guard.mjs')}"`;
  const journalCmd = `node "${path.join(root, 'scripts/hooks/journal.mjs')}"`;
  // Match by script basename, not exact command: a user who adds node flags
  // to the trellis entry must not get a second vanilla copy on re-wire.
  const hasScript = (entries, script) =>
    (Array.isArray(entries) ? entries : []).some((entry) =>
      (Array.isArray(entry?.hooks) ? entry.hooks : []).some(
        (h) => typeof h?.command === 'string' && h.command.includes(script),
      ));

  settings.hooks = settings.hooks ?? {};
  for (const key of ['Stop', 'PostToolUse']) {
    if (settings.hooks[key] !== undefined && !Array.isArray(settings.hooks[key])) {
      // ?? alone kept a truthy object and crashed later with a raw TypeError
      console.error(
        `refusing to wire hooks: hooks.${key} in ${settingsPath} is not an array — fix it manually, then re-run`,
      );
      return;
    }
  }
  settings.hooks.Stop = settings.hooks.Stop ?? [];
  if (!hasScript(settings.hooks.Stop, 'stop-guard.mjs')) {
    settings.hooks.Stop.push({ hooks: [{ type: 'command', command: stopCmd }] });
  }
  settings.hooks.PostToolUse = settings.hooks.PostToolUse ?? [];
  if (!hasScript(settings.hooks.PostToolUse, 'journal.mjs')) {
    settings.hooks.PostToolUse.push({
      matcher: 'Edit|Write|Bash',
      hooks: [{ type: 'command', command: journalCmd }],
    });
  }
  fs.mkdirSync(settingsDir, { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  console.log(`wired Stop + PostToolUse hooks in ${settingsPath}`);
}

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

  // The MCP server alone is passive — rules blocks are what make agents
  // actually call it, so project wiring always ships them.
  upsertRulesBlock(path.join(dir, 'CLAUDE.md'));
  upsertRulesBlock(path.join(dir, 'AGENTS.md'));
  if (wantCursor) writeCursorRules(dir);
  if (wantWindsurf) upsertRulesBlock(path.join(dir, '.windsurfrules'));
  if (wantHooks) wireHooks(dir);
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
