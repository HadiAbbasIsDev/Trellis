/**
 * Self-test for the Claude Code hooks + wire.mjs idempotency.
 *
 * Hooks can't be exercised from vitest inside packages/* (they are plain-node
 * scripts driven by stdin, cwd-sensitive, outside the workspace), so this
 * harness feeds them synthetic stdin — including a fake transcript JSONL —
 * and asserts stdout, exit codes, journal writes, and rotation. It then runs
 * wire.mjs twice against a throwaway project and proves the second run
 * changes nothing.
 *
 * Usage: node scripts/hooks/selftest.mjs      (exit 0 on PASS, 1 on FAIL)
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const hooksDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(hooksDir, '..', '..');
const stopGuard = path.join(hooksDir, 'stop-guard.mjs');
const journal = path.join(hooksDir, 'journal.mjs');
const wire = path.join(root, 'scripts', 'wire.mjs');

let failures = 0;
function check(label, cond, detail = '') {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failures++;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function runHook(script, stdinText, cwd) {
  return spawnSync(process.execPath, [script], { input: stdinText, cwd, encoding: 'utf8' });
}

/** Fake transcript line: an assistant message carrying the given tool_use names. */
function assistantLine(...toolNames) {
  return JSON.stringify({
    type: 'assistant',
    message: { role: 'assistant', content: toolNames.map((name) => ({ type: 'tool_use', id: 'x', name, input: {} })) },
  });
}
const userLine = JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'hi' }] } });

function makeTranscript(dir, lines) {
  const p = path.join(dir, `transcript-${Math.random().toString(36).slice(2, 8)}.jsonl`);
  fs.writeFileSync(p, lines.join('\n') + '\n');
  return p;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'trellis-hooks-'));

try {
  // ---------------------------------------------------------- stop-guard
  console.log('stop-guard.mjs');
  const proj = path.join(tmp, 'proj');
  fs.mkdirSync(proj, { recursive: true });

  const busyNoMemory = makeTranscript(tmp, [
    userLine,
    assistantLine('Read', 'Bash'),
    assistantLine('Edit'),
    assistantLine('Write', 'Bash', 'Grep'),
    assistantLine('mcp__trellis__memory_search'), // searches don't count as writes
  ]);

  let r = runHook(stopGuard, JSON.stringify({ session_id: 's1', transcript_path: busyNoMemory, stop_hook_active: false }), proj);
  check('blocks busy session with no memory writes', r.status === 0 && r.stdout.includes('"decision":"block"'), `status=${r.status} out=${r.stdout.slice(0, 120)}`);
  check('reason names memory_write', r.stdout.includes('memory_write'), r.stdout.slice(0, 200));
  check('reason omits journal when absent', !r.stdout.includes('.journal'), r.stdout);

  fs.mkdirSync(path.join(proj, '.trellis', '.journal'), { recursive: true });
  fs.writeFileSync(path.join(proj, '.trellis', '.journal', 'current.jsonl'), '{"ts":"t"}\n');
  r = runHook(stopGuard, JSON.stringify({ session_id: 's1', transcript_path: busyNoMemory, stop_hook_active: false }), proj);
  check('reason mentions journal when it exists', r.stdout.includes('current.jsonl'), r.stdout.slice(0, 300));

  r = runHook(stopGuard, JSON.stringify({ session_id: 's1', transcript_path: busyNoMemory, stop_hook_active: true }), proj);
  check('stop_hook_active passes through (no loop)', r.status === 0 && r.stdout === '', `status=${r.status} out=${r.stdout}`);

  const busyWithWrite = makeTranscript(tmp, [
    assistantLine('Read', 'Bash', 'Edit'),
    assistantLine('Write', 'Bash'),
    assistantLine('Grep', 'mcp__trellis__memory_write'),
  ]);
  r = runHook(stopGuard, JSON.stringify({ session_id: 's1', transcript_path: busyWithWrite, stop_hook_active: false }), proj);
  check('memory_write in transcript disarms the guard', r.status === 0 && r.stdout === '', r.stdout);

  const quiet = makeTranscript(tmp, [assistantLine('Read'), assistantLine('Bash')]);
  r = runHook(stopGuard, JSON.stringify({ session_id: 's1', transcript_path: quiet, stop_hook_active: false }), proj);
  check('below threshold passes through', r.status === 0 && r.stdout === '', r.stdout);

  r = runHook(stopGuard, JSON.stringify({ session_id: 's1', transcript_path: path.join(tmp, 'missing.jsonl'), stop_hook_active: false }), proj);
  check('missing transcript fails safe', r.status === 0 && r.stdout === '', `status=${r.status}`);

  r = runHook(stopGuard, 'not json at all', proj);
  check('garbage stdin fails safe', r.status === 0 && r.stdout === '', `status=${r.status}`);

  // ------------------------------------------------------------- journal
  console.log('journal.mjs');
  const jproj = path.join(tmp, 'jproj');
  fs.mkdirSync(jproj, { recursive: true });
  const journalFile = path.join(jproj, '.trellis', '.journal', 'current.jsonl');

  r = runHook(journal, JSON.stringify({ session_id: 'sj', tool_name: 'Write', tool_input: { file_path: '/a/b.ts', content: 'x' } }), jproj);
  check('journal exits 0 silently', r.status === 0 && r.stdout === '', `status=${r.status}`);
  let lines = fs.readFileSync(journalFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  check('journal line has file_path detail', lines.length === 1 && lines[0].detail === '/a/b.ts' && lines[0].tool === 'Write' && lines[0].session_id === 'sj', JSON.stringify(lines));
  check('journal line has ts', typeof lines[0].ts === 'string' && !Number.isNaN(Date.parse(lines[0].ts)), lines[0].ts);

  const longCmd = 'echo ' + 'x'.repeat(200);
  r = runHook(journal, JSON.stringify({ session_id: 'sj', tool_name: 'Bash', tool_input: { command: longCmd } }), jproj);
  lines = fs.readFileSync(journalFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  check('bash command truncated to 80 chars', lines.length === 2 && lines[1].detail === longCmd.slice(0, 80), `len=${lines[1]?.detail?.length}`);

  // rotation: inflate past 200KB, next append must rotate first
  fs.appendFileSync(journalFile, JSON.stringify({ pad: 'y'.repeat(1024) }).repeat(210) + '\n');
  r = runHook(journal, JSON.stringify({ session_id: 'sj', tool_name: 'Edit', tool_input: { file_path: '/after/rotate.ts' } }), jproj);
  const dirEntries = fs.readdirSync(path.dirname(journalFile));
  const rotated = dirEntries.filter((f) => f !== 'current.jsonl');
  const fresh = fs.readFileSync(journalFile, 'utf8').trim().split('\n');
  check('rotation created a dated file', rotated.length === 1 && /\.jsonl$/.test(rotated[0] ?? ''), dirEntries.join(','));
  check('current.jsonl restarted with the new line', fresh.length === 1 && JSON.parse(fresh[0]).detail === '/after/rotate.ts', fresh[0]?.slice(0, 120));

  r = runHook(journal, '{{{{', jproj);
  check('journal garbage stdin fails safe', r.status === 0 && r.stdout === '', `status=${r.status}`);

  // ------------------------------------------------- wire.mjs idempotency
  console.log('wire.mjs idempotency');
  const wproj = path.join(tmp, 'wproj');
  fs.mkdirSync(wproj, { recursive: true });
  // pre-existing user content that must survive both runs untouched
  fs.writeFileSync(path.join(wproj, 'CLAUDE.md'), '# My project\n\nHand-written notes.\n');
  fs.writeFileSync(path.join(wproj, '.mcp.json'), JSON.stringify({ mcpServers: { other: { command: 'x' } } }, null, 2));
  fs.mkdirSync(path.join(wproj, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(wproj, '.claude', 'settings.json'), JSON.stringify({ permissions: { allow: ['Bash'] } }, null, 2));

  const wireArgs = [wire, wproj, '--cursor-rules', '--windsurf', '--hooks'];
  const run1 = spawnSync(process.execPath, wireArgs, { encoding: 'utf8' });
  check('wire run 1 exits 0', run1.status === 0, run1.stderr);

  const tracked = [
    'CLAUDE.md', 'AGENTS.md', '.windsurfrules', '.mcp.json',
    path.join('.cursor', 'rules', 'trellis.mdc'), path.join('.claude', 'settings.json'),
  ];
  const snap = () => tracked.map((f) => {
    const p = path.join(wproj, f);
    return `${f}:${fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '<missing>'}`;
  }).join('\n===\n');
  const after1 = snap();

  const run2 = spawnSync(process.execPath, wireArgs, { encoding: 'utf8' });
  check('wire run 2 exits 0', run2.status === 0, run2.stderr);
  check('second run changes nothing (idempotent)', snap() === after1);

  const claudeMd = fs.readFileSync(path.join(wproj, 'CLAUDE.md'), 'utf8');
  check('user prose preserved in CLAUDE.md', claudeMd.startsWith('# My project\n\nHand-written notes.'), claudeMd.slice(0, 80));
  check('managed block present once', claudeMd.split('<!-- trellis:begin -->').length === 2 && claudeMd.split('<!-- trellis:end -->').length === 2);
  check('AGENTS.md created with block', fs.readFileSync(path.join(wproj, 'AGENTS.md'), 'utf8').includes('memory_search'));
  check('.windsurfrules created with block', fs.readFileSync(path.join(wproj, '.windsurfrules'), 'utf8').includes('<!-- trellis:begin -->'));

  const mdc = fs.readFileSync(path.join(wproj, '.cursor', 'rules', 'trellis.mdc'), 'utf8');
  check('mdc frontmatter has alwaysApply', mdc.startsWith('---\n') && mdc.includes('alwaysApply: true') && mdc.includes('description:'), mdc.slice(0, 120));

  const mcp = JSON.parse(fs.readFileSync(path.join(wproj, '.mcp.json'), 'utf8'));
  check('.mcp.json merge keeps existing servers', Boolean(mcp.mcpServers.other) && Boolean(mcp.mcpServers.trellis));

  const settings = JSON.parse(fs.readFileSync(path.join(wproj, '.claude', 'settings.json'), 'utf8'));
  check('settings.json keeps existing keys', Array.isArray(settings.permissions?.allow));
  check('exactly one Stop hook entry after two runs', settings.hooks?.Stop?.length === 1 && settings.hooks.Stop[0].hooks[0].command.includes('stop-guard.mjs'), JSON.stringify(settings.hooks?.Stop));
  check('exactly one PostToolUse entry with matcher', settings.hooks?.PostToolUse?.length === 1 && settings.hooks.PostToolUse[0].matcher === 'Edit|Write|Bash' && settings.hooks.PostToolUse[0].hooks[0].command.includes('journal.mjs'), JSON.stringify(settings.hooks?.PostToolUse));

  // wired hooks must actually run from a settings-style command line
  const wiredStop = settings.hooks.Stop[0].hooks[0].command;
  const viaShell = spawnSync('sh', ['-c', wiredStop], {
    input: JSON.stringify({ session_id: 's', transcript_path: busyNoMemory, stop_hook_active: false }),
    cwd: wproj,
    encoding: 'utf8',
  });
  check('wired Stop command runs as configured', viaShell.status === 0 && viaShell.stdout.includes('"decision":"block"'), `status=${viaShell.status} out=${viaShell.stdout.slice(0, 120)}`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(failures === 0 ? '\nHOOKS SELFTEST PASS' : `\nHOOKS SELFTEST FAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
