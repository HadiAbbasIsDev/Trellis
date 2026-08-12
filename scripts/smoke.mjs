/**
 * Smoke test: drives the built MCP server over stdio exactly like a client
 * (newline-delimited JSON-RPC) and checks the full write -> search -> expand
 * -> link loop against a throwaway vault. Exit 0 on PASS, 1 on FAIL.
 *
 * Usage: node scripts/smoke.mjs   (SMOKE_DIR overrides the temp vault location)
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverPath = path.join(root, 'packages/mcp/dist/server.js');
const vaultBase = process.env.SMOKE_DIR || os.tmpdir();
const vault = mkdtempSync(path.join(vaultBase, 'trellis-smoke-'));

const child = spawn(process.execPath, [serverPath, '--vault', vault], {
  stdio: ['pipe', 'pipe', 'pipe'],
});
child.stderr.on('data', () => {}); // logging channel; ignore

let nextId = 1;
const pending = new Map();
let buffer = '';
child.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  let nl;
  while ((nl = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  }
});

function request(method, params) {
  const id = nextId++;
  const p = new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`timeout waiting for ${method}`));
      }
    }, 15000);
  });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  return p;
}
function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}
const callTool = async (name, args) => {
  const res = await request('tools/call', { name, arguments: args });
  return (res.content ?? []).map((c) => c.text ?? '').join('\n');
};

let failures = 0;
function check(label, cond, detail = '') {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

try {
  const init = await request('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'trellis-smoke', version: '0.0.0' },
  });
  check('initialize', init.serverInfo?.name === 'trellis', JSON.stringify(init.serverInfo));
  notify('notifications/initialized', {});

  const tools = await request('tools/list', {});
  const names = (tools.tools ?? []).map((t) => t.name).sort();
  check('tools/list has 4 tools', names.join(',') === 'memory_expand,memory_link,memory_search,memory_write', names.join(','));

  const empty = await callTool('memory_search', { query: 'anything at all' });
  check('empty vault prompts writing', empty.includes('graph is empty'), empty.slice(0, 120));

  const w1 = await callTool('memory_write', {
    type: 'decision',
    title: 'Use pure-TS BM25 index instead of SQLite',
    summary: 'No native prebuilds means no install failures across platforms.',
    body: 'Rebuildable from the vault at any time; see [[local-first-constraint]].',
    edges: [{ rel: 'depends_on', to: 'local-first-constraint' }],
  });
  check('write decision', w1.includes('recorded (decision) [use-pure-ts-bm25-index-instead-of-sqlite]'), w1.slice(0, 160));
  check('forward-ref warning', w1.includes('local-first-constraint'), w1);

  const w2 = await callTool('memory_write', {
    type: 'constraint',
    title: 'Local-first constraint',
    summary: 'Everything runs on the user machine: no server, no accounts, no keys.',
  });
  check('write constraint', w2.includes('recorded (constraint)'), w2.slice(0, 160));

  const w3 = await callTool('memory_write', {
    type: 'decision',
    title: 'Use SQLite with native prebuilds',
    summary: 'Ship better-sqlite3 prebuilds for five platforms.',
    edges: [],
  });
  const w3id = /\[([a-z0-9-]+)\]/.exec(w3)?.[1];
  check('write old decision', Boolean(w3id), w3.slice(0, 160));

  // supersede the old decision and confirm it disappears from search
  const link = await callTool('memory_link', {
    from: 'use-pure-ts-bm25-index-instead-of-sqlite',
    rel: 'supersedes',
    to: w3id,
  });
  check('supersedes link', link.includes('hidden from retrieval'), link);

  const search = await callTool('memory_search', { query: 'sqlite index prebuilds' });
  check('search finds current decision', search.includes('[use-pure-ts-bm25-index-instead-of-sqlite]'), search);
  check('superseded node hidden', !search.includes(`[${w3id}]`), search);
  check('graph header present', /memory graph: \d+ nodes/.test(search), search.split('\n')[0]);
  check('footer nudges/updates', search.includes('[session:'), search);

  const expand = await callTool('memory_expand', { ids: ['use-pure-ts-bm25-index-instead-of-sqlite', 'nope-missing'] });
  check('expand returns body', expand.includes('Rebuildable from the vault'), expand.slice(0, 200));
  check('expand reports missing', expand.includes('not found: nope-missing'), expand);

  const dupe = await callTool('memory_write', {
    type: 'decision',
    title: 'Use a pure TypeScript BM25 index rather than SQLite',
    summary: 'Avoids native prebuilds and install failures on all platforms.',
  });
  check('near-duplicate warned', dupe.includes('near-duplicates exist'), dupe);

  // hard contract: estimateTokens = ceil(chars/4), so 100 tokens ⇒ ≤400 chars
  const budget = await callTool('memory_search', { query: 'decision constraint sqlite local', budget_tokens: 100 });
  check('tiny budget respected (hard)', budget.length <= 400, `${budget.length} chars`);
} catch (err) {
  failures++;
  console.log(`  ✗ fatal: ${err.message}`);
} finally {
  child.kill();
  rmSync(vault, { recursive: true, force: true });
}

console.log(failures === 0 ? '\nSMOKE PASS' : `\nSMOKE FAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
