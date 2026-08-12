/**
 * Project wiring: .mcp.json, managed rules blocks, Cursor rules, Claude Code
 * hooks. Pure functions over the filesystem that RETURN messages instead of
 * printing, so the CLI and the VS Code extension surface them their own way.
 *
 * Behavior contracts (enforced by test + the hooks selftest):
 * - merges, never clobbers: user content outside markers is byte-for-byte
 * - markers inside code fences are user prose, not managed spans
 * - re-running is always a no-op on an already-wired project
 * - malformed inputs are refused with a message, never a crash
 */
import fs from 'node:fs';
import path from 'node:path';

export const BEGIN = '<!-- trellis:begin -->';
export const END = '<!-- trellis:end -->';

export const RULES_BODY = [
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

export interface WireOutcome {
  messages: string[];
  errors: string[];
}

/** Tokens of a shell-ish command, quotes stripped — for basename matching. */
function commandTargets(cmd: string): string[] {
  const out: string[] = [];
  const re = /"([^"]+)"|'([^']+)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cmd)) !== null) out.push(m[1] ?? m[2] ?? m[3]!);
  return out;
}

/**
 * Marker offsets, ignoring any markers inside ``` / ~~~ code fences.
 * CommonMark closes a fence only with the SAME character that opened it — a
 * naive either-char toggle let a ~~~ line inside a backtick fence flip the
 * parser out and eat fenced user prose (proven by review).
 */
export function findMarkers(content: string): { begin: number; end: number } {
  let fenceChar: '`' | '~' | null = null;
  let offset = 0;
  let begin = -1;
  let end = -1;
  for (const line of content.split('\n')) {
    const t = line.replace(/\r$/, '').trimStart();
    if (fenceChar === null) {
      if (t.startsWith('```')) fenceChar = '`';
      else if (t.startsWith('~~~')) fenceChar = '~';
      else {
        const stripped = line.replace(/\r$/, '');
        if (begin === -1 && stripped.trim() === BEGIN) begin = offset + line.indexOf(BEGIN);
        else if (end === -1 && stripped.trim() === END) end = offset + line.indexOf(END);
      }
    } else if (
      (fenceChar === '`' && t.startsWith('```')) ||
      (fenceChar === '~' && t.startsWith('~~~'))
    ) {
      fenceChar = null;
    }
    offset += line.length + 1;
  }
  return { begin, end };
}

/** Insert/replace the managed block, preserving the file's dominant EOL. */
export function upsertRulesBlock(filePath: string): WireOutcome {
  const out: WireOutcome = { messages: [], errors: [] };
  let content = '';
  if (fs.existsSync(filePath)) content = fs.readFileSync(filePath, 'utf8');
  const crlf = (content.match(/\r\n/g) ?? []).length > (content.match(/(?<!\r)\n/g) ?? []).length;
  const eol = crlf ? '\r\n' : '\n';
  const managed = [BEGIN, ...RULES_BODY.split('\n'), END].join(eol);
  const { begin: b, end: e } = findMarkers(content);
  let next: string;
  if (b !== -1 && e !== -1 && e > b) {
    next = content.slice(0, b) + managed + content.slice(e + END.length);
  } else if (b !== -1 || e !== -1) {
    out.errors.push(`skipping ${filePath}: found a lone trellis marker — fix or remove it, then re-run`);
    return out;
  } else if (content.length > 0) {
    next = content.replace(/\s*$/, eol + eol) + managed + eol;
  } else {
    next = managed + eol;
  }
  if (next !== content) {
    fs.writeFileSync(filePath, next);
    out.messages.push(`wrote trellis block in ${filePath}`);
  } else {
    out.messages.push(`${filePath} already up to date`);
  }
  return out;
}

/** Cursor's .mdc rule file is fully trellis-owned, so overwrite is safe. */
export function writeCursorRules(dir: string): WireOutcome {
  const out: WireOutcome = { messages: [], errors: [] };
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
    out.messages.push(`${rulePath} already up to date`);
  } else {
    fs.writeFileSync(rulePath, content);
    out.messages.push(`wrote ${rulePath}`);
  }
  return out;
}

/** Merge the trellis server into <dir>/.mcp.json (other servers preserved). */
export function wireMcpJson(dir: string, serverPath: string): WireOutcome {
  const out: WireOutcome = { messages: [], errors: [] };
  const mcpPath = path.join(dir, '.mcp.json');
  let config: Record<string, any> = {};
  if (fs.existsSync(mcpPath)) {
    try {
      config = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
    } catch {
      out.errors.push(`refusing to overwrite unparseable ${mcpPath}`);
      return out;
    }
  }
  config.mcpServers = config.mcpServers ?? {};
  config.mcpServers.trellis = { command: 'node', args: [serverPath] };
  fs.writeFileSync(mcpPath, JSON.stringify(config, null, 2) + '\n');
  out.messages.push(`wrote ${mcpPath} (Claude Code picks it up on next session in that project)`);
  return out;
}

/**
 * Merge Stop + PostToolUse hook entries into <dir>/.claude/settings.json.
 * Matched by script basename so user-customized commands never duplicate.
 */
export function wireHooks(dir: string, stopScript: string, journalScript: string): WireOutcome {
  const out: WireOutcome = { messages: [], errors: [] };
  const settingsDir = path.join(dir, '.claude');
  const settingsPath = path.join(settingsDir, 'settings.json');
  let settings: Record<string, any> = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch {
      out.errors.push(
        `skipping hooks: ${settingsPath} is not plain JSON (comments?) — add the hook entries manually, see docs/WIRING.md`,
      );
      return out;
    }
  }
  const stopCmd = `node "${stopScript}"`;
  const journalCmd = `node "${journalScript}"`;
  // Exact basename equality on the command's tokens — a substring test let a
  // user's "my-stop-guard.mjs" suppress wiring of the real guard entirely.
  const hasScript = (entries: unknown, script: string): boolean =>
    (Array.isArray(entries) ? entries : []).some((entry: any) =>
      (Array.isArray(entry?.hooks) ? entry.hooks : []).some(
        (h: any) => typeof h?.command === 'string' &&
          commandTargets(h.command).some((t) => path.basename(t) === script),
      ));

  settings.hooks = settings.hooks ?? {};
  for (const key of ['Stop', 'PostToolUse']) {
    if (settings.hooks[key] !== undefined && !Array.isArray(settings.hooks[key])) {
      out.errors.push(
        `refusing to wire hooks: hooks.${key} in ${settingsPath} is not an array — fix it manually, then re-run`,
      );
      return out;
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
  out.messages.push(`wired Stop + PostToolUse hooks in ${settingsPath}`);
  return out;
}

export interface WireProjectOptions {
  serverPath: string; // absolute path to the bundled MCP server
  stopScript: string; // absolute path to stop-guard.mjs
  journalScript: string; // absolute path to journal.mjs
  cursorRules?: boolean;
  windsurf?: boolean;
  hooks?: boolean;
}

/** Full project wiring — what the CLI positional arg and the extension command both run. */
export function wireProject(dir: string, opts: WireProjectOptions): WireOutcome {
  const out: WireOutcome = { messages: [], errors: [] };
  const merge = (r: WireOutcome) => {
    out.messages.push(...r.messages);
    out.errors.push(...r.errors);
  };
  merge(wireMcpJson(dir, opts.serverPath));
  // The MCP server alone is passive — rules blocks are what make agents
  // actually call it, so project wiring always ships them.
  merge(upsertRulesBlock(path.join(dir, 'CLAUDE.md')));
  merge(upsertRulesBlock(path.join(dir, 'AGENTS.md')));
  if (opts.cursorRules) merge(writeCursorRules(dir));
  if (opts.windsurf) merge(upsertRulesBlock(path.join(dir, '.windsurfrules')));
  if (opts.hooks) merge(wireHooks(dir, opts.stopScript, opts.journalScript));
  return out;
}

/**
 * Repair trellis-owned paths that went stale — e.g. the VS Code extension
 * updated versions and its install dir moved. ONLY rewrites entries that are
 * recognizably ours (server path in .mcp.json, hook commands by basename) and
 * only when the recorded path no longer exists.
 */
export function repairStalePaths(dir: string, opts: WireProjectOptions): WireOutcome {
  const out: WireOutcome = { messages: [], errors: [] };
  const mcpPath = path.join(dir, '.mcp.json');
  try {
    if (fs.existsSync(mcpPath)) {
      const config = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
      const entry = config?.mcpServers?.trellis;
      const recorded = entry?.args?.[0];
      if (
        typeof recorded === 'string' &&
        recorded !== opts.serverPath &&
        !fs.existsSync(recorded)
      ) {
        entry.args[0] = opts.serverPath;
        fs.writeFileSync(mcpPath, JSON.stringify(config, null, 2) + '\n');
        out.messages.push(`repaired stale trellis server path in ${mcpPath}`);
      }
    }
  } catch {
    /* unparseable — wiring functions report that; repair stays silent */
  }
  const settingsPath = path.join(dir, '.claude', 'settings.json');
  try {
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      let changed = false;
      for (const [key, script] of [
        ['Stop', opts.stopScript],
        ['PostToolUse', opts.journalScript],
      ] as const) {
        for (const entry of Array.isArray(settings?.hooks?.[key]) ? settings.hooks[key] : []) {
          for (const h of Array.isArray(entry?.hooks) ? entry.hooks : []) {
            const m = typeof h?.command === 'string' && /^node "([^"]+)"$/.exec(h.command);
            const base = path.basename(script);
            // exact basename only: endsWith() claimed a user's
            // "my-stop-guard.mjs" as ours and silently hijacked their hook
            if (m && path.basename(m[1]!) === base && m[1] !== script && !fs.existsSync(m[1]!)) {
              h.command = `node "${script}"`;
              changed = true;
            }
          }
        }
      }
      if (changed) {
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
        out.messages.push(`repaired stale hook paths in ${settingsPath}`);
      }
    }
  } catch {
    /* same policy */
  }
  return out;
}
