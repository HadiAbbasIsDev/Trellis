import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  findMarkers,
  repairStalePaths,
  upsertRulesBlock,
  wireHooks,
  wireMcpJson,
  wireProject,
  BEGIN,
  END,
} from '@trellis/wiring';

const tmp: string[] = [];
function proj(): string {
  const d = mkdtempSync(path.join(os.tmpdir(), 'wiring-'));
  tmp.push(d);
  return d;
}
afterEach(() => {
  for (const d of tmp.splice(0)) rmSync(d, { recursive: true, force: true });
});

const OPTS = (dir: string) => ({
  serverPath: path.join(dir, 'fake-server.js'),
  stopScript: path.join(dir, 'stop-guard.mjs'),
  journalScript: path.join(dir, 'journal.mjs'),
  hooks: true,
});

describe('rules block', () => {
  it('creates, then is byte-identical on re-run', () => {
    const dir = proj();
    const f = path.join(dir, 'CLAUDE.md');
    upsertRulesBlock(f);
    const first = readFileSync(f, 'utf8');
    expect(first).toContain(BEGIN);
    expect(upsertRulesBlock(f).messages[0]).toContain('already up to date');
    expect(readFileSync(f, 'utf8')).toBe(first);
  });

  it('preserves user prose and ignores markers inside code fences', () => {
    const dir = proj();
    const f = path.join(dir, 'CLAUDE.md');
    const doc = `# Mine\n\n\`\`\`markdown\n${BEGIN}\nUSER PROSE\n${END}\n\`\`\`\n\ntail\n`;
    writeFileSync(f, doc);
    upsertRulesBlock(f);
    const after = readFileSync(f, 'utf8');
    expect(after).toContain('USER PROSE');
    expect(after).toContain('tail');
    expect(after.lastIndexOf('## Project memory')).toBeGreaterThan(after.indexOf('tail'));
  });

  it('keeps CRLF files CRLF', () => {
    const dir = proj();
    const f = path.join(dir, 'CLAUDE.md');
    writeFileSync(f, 'line one\r\nline two\r\n');
    upsertRulesBlock(f);
    const after = readFileSync(f, 'utf8');
    expect(after.includes('\r\n## Project memory')).toBe(true);
    expect(/(?<!\r)\n## Project memory/.test(after)).toBe(false);
  });

  it('refuses lone markers', () => {
    const dir = proj();
    const f = path.join(dir, 'CLAUDE.md');
    writeFileSync(f, `prose\n${END}\nmore`);
    const out = upsertRulesBlock(f);
    expect(out.errors[0]).toContain('lone trellis marker');
    expect(readFileSync(f, 'utf8')).toBe(`prose\n${END}\nmore`);
  });
});

describe('findMarkers', () => {
  it('only matches at fence depth zero', () => {
    const content = `\`\`\`\n${BEGIN}\n\`\`\`\n${BEGIN}\nx\n${END}\n`;
    const { begin, end } = findMarkers(content);
    expect(begin).toBeGreaterThan(content.indexOf('```\n' + BEGIN));
    expect(end).toBeGreaterThan(begin);
  });

  it('a ~~~ line inside a backtick fence does not close it (CommonMark)', () => {
    const content = `\`\`\`text\n~~~\n${BEGIN}\nFENCED USER EXAMPLE\n${END}\n\`\`\`\n`;
    const { begin, end } = findMarkers(content);
    expect(begin).toBe(-1);
    expect(end).toBe(-1);
    // and therefore upsert appends a real block instead of eating the example
    const dir = proj();
    const f = path.join(dir, 'CLAUDE.md');
    writeFileSync(f, content);
    upsertRulesBlock(f);
    expect(readFileSync(f, 'utf8')).toContain('FENCED USER EXAMPLE');
  });
});

describe('mcp + hooks wiring', () => {
  it('merges without clobbering existing servers and settings keys', () => {
    const dir = proj();
    writeFileSync(path.join(dir, '.mcp.json'), JSON.stringify({ mcpServers: { other: { command: 'x' } } }));
    mkdirSync(path.join(dir, '.claude'));
    writeFileSync(path.join(dir, '.claude/settings.json'), JSON.stringify({ permissions: { allow: ['Bash'] } }));
    const out = wireProject(dir, OPTS(dir));
    expect(out.errors).toEqual([]);
    const mcp = JSON.parse(readFileSync(path.join(dir, '.mcp.json'), 'utf8'));
    expect(mcp.mcpServers.other).toEqual({ command: 'x' });
    expect(mcp.mcpServers.trellis.args[0]).toBe(OPTS(dir).serverPath);
    const settings = JSON.parse(readFileSync(path.join(dir, '.claude/settings.json'), 'utf8'));
    expect(settings.permissions).toEqual({ allow: ['Bash'] });
    expect(settings.hooks.Stop).toHaveLength(1);
    expect(settings.hooks.PostToolUse[0].matcher).toBe('Edit|Write|Bash');
  });

  it('re-run adds no duplicates even after user edits the command', () => {
    const dir = proj();
    wireProject(dir, OPTS(dir));
    const sp = path.join(dir, '.claude/settings.json');
    const s = JSON.parse(readFileSync(sp, 'utf8'));
    s.hooks.Stop[0].hooks[0].command = `node --max-old-space-size=256 "${OPTS(dir).stopScript}"`;
    writeFileSync(sp, JSON.stringify(s));
    wireProject(dir, OPTS(dir));
    expect(JSON.parse(readFileSync(sp, 'utf8')).hooks.Stop).toHaveLength(1);
  });

  it('object-shaped hooks arrays are refused with a message, not a crash', () => {
    const dir = proj();
    mkdirSync(path.join(dir, '.claude'));
    writeFileSync(path.join(dir, '.claude/settings.json'), JSON.stringify({ hooks: { Stop: { hooks: [] } } }));
    const out = wireHooks(dir, OPTS(dir).stopScript, OPTS(dir).journalScript);
    expect(out.errors[0]).toContain('not an array');
  });

  it("a user's my-stop-guard.mjs neither suppresses wiring nor gets hijacked by repair", () => {
    const dir = proj();
    const userScript = path.join(dir, 'tools', 'my-stop-guard.mjs'); // missing on purpose
    mkdirSync(path.join(dir, '.claude'));
    writeFileSync(path.join(dir, '.claude/settings.json'), JSON.stringify({
      hooks: { Stop: [{ hooks: [{ type: 'command', command: `node "${userScript}"` }] }] },
    }));
    const opts = OPTS(dir);
    // wiring must still ADD the real trellis guard (substring match suppressed it)
    wireHooks(dir, opts.stopScript, opts.journalScript);
    const settings = JSON.parse(readFileSync(path.join(dir, '.claude/settings.json'), 'utf8'));
    expect(settings.hooks.Stop).toHaveLength(2);
    // and repair must leave the user's stale-but-not-ours path alone
    repairStalePaths(dir, opts);
    const after = JSON.parse(readFileSync(path.join(dir, '.claude/settings.json'), 'utf8'));
    expect(after.hooks.Stop[0].hooks[0].command).toBe(`node "${userScript}"`);
  });

  it('JSONC settings are skipped cleanly', () => {
    const dir = proj();
    mkdirSync(path.join(dir, '.claude'));
    writeFileSync(path.join(dir, '.claude/settings.json'), '// comment\n{}');
    const out = wireHooks(dir, OPTS(dir).stopScript, OPTS(dir).journalScript);
    expect(out.errors[0]).toContain('not plain JSON');
  });
});

describe('repairStalePaths (extension updates move the install dir)', () => {
  it('repairs trellis-owned paths that no longer exist, leaves live ones alone', () => {
    const dir = proj();
    const stale = path.join(dir, 'gone', 'server.js'); // does not exist
    writeFileSync(path.join(dir, '.mcp.json'), JSON.stringify({
      mcpServers: {
        other: { command: 'x', args: ['keep'] },
        trellis: { command: 'node', args: [stale] },
      },
    }));
    mkdirSync(path.join(dir, '.claude'));
    writeFileSync(path.join(dir, '.claude/settings.json'), JSON.stringify({
      hooks: { Stop: [{ hooks: [{ type: 'command', command: `node "${path.join(dir, 'gone', 'stop-guard.mjs')}"` }] }] },
    }));
    const opts = OPTS(dir);
    const out = repairStalePaths(dir, opts);
    expect(out.messages).toHaveLength(2);
    const mcp = JSON.parse(readFileSync(path.join(dir, '.mcp.json'), 'utf8'));
    expect(mcp.mcpServers.trellis.args[0]).toBe(opts.serverPath);
    expect(mcp.mcpServers.other.args[0]).toBe('keep');
    // second run: nothing to do
    expect(repairStalePaths(dir, opts).messages).toHaveLength(0);
  });

  it('never touches a recorded path that still exists', () => {
    const dir = proj();
    const live = path.join(dir, 'live-server.js');
    writeFileSync(live, '');
    writeFileSync(path.join(dir, '.mcp.json'), JSON.stringify({
      mcpServers: { trellis: { command: 'node', args: [live] } },
    }));
    expect(repairStalePaths(dir, OPTS(dir)).messages).toHaveLength(0);
    expect(JSON.parse(readFileSync(path.join(dir, '.mcp.json'), 'utf8')).mcpServers.trellis.args[0]).toBe(live);
  });
});
