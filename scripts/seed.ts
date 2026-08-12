/**
 * Seed this repo's own vault with the project's real memory — Trellis
 * dogfooding Trellis from day one. Idempotent: skips ids that already exist.
 *
 * Usage: npm run seed
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createNode,
  loadVault,
  slugify,
  writeNode,
  type NodeInput,
} from '../packages/core/src/index';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vaultDir = path.join(root, '.trellis');

const SEEDS: NodeInput[] = [
  {
    type: 'constraint',
    title: 'Local-first: no server, no accounts, no keys, no telemetry',
    summary: 'Everything runs on the user machine; memory of proprietary code never leaves disk.',
    body: 'This is both the trust story and the cost story ($0 marginal per user). Team sync, if ever, is "point the vault at a git repo" — we stay a pure client.',
    confidence: 1,
    tags: ['architecture', 'privacy'],
  },
  {
    type: 'decision',
    title: 'Pure-TS BM25 index instead of SQLite',
    summary: 'No native prebuilds ends the platform-matrix install failures; markdown vault stays the source of truth.',
    body: 'better-sqlite3/sqlite-vec need prebuilds for 5 platforms — historically the top source of "extension will not install". A ~150-line inverted index is instant at vault scale and rebuildable from markdown at any time, so a later swap is a re-index, not a migration. See [[local-first-no-server-no-accounts-no-keys-no-telemetry]].',
    tags: ['stack'],
    edges: [{ rel: 'depends_on', to: 'local-first-no-server-no-accounts-no-keys-no-telemetry' }],
  },
  {
    type: 'decision',
    title: 'Agent writes its own memory; no second-model extraction pass',
    summary: 'No API keys and no shelling out to CLIs — the agent records facts via MCP tools as it works.',
    body: 'User explicitly rejected an extraction pass (even keyless CLI shelling) as friction. This makes write-back reliability THE core problem — mitigated by [[five-channel-write-back-ladder]].',
    tags: ['architecture'],
    edges: [{ rel: 'depends_on', to: 'five-channel-write-back-ladder' }],
  },
  {
    type: 'component',
    title: 'Five-channel write-back ladder',
    summary: 'Redundant channels get agents to write memory: tool descriptions, response footers, rules blocks, hooks, session journal.',
    body: 'Ordered universal → deep. (1) Tool descriptions load in every client unconditionally. (2) Session-state footers on every response are the only DYNAMIC universal channel — highest leverage. (3) Generated rules blocks in CLAUDE.md/AGENTS.md/.cursor/rules. (4) Claude Code Stop/PreCompact hooks. (5) Zero-LLM session journal as raw material. Rungs 1–2 ship in Phase 0 (packages/mcp/src/format.ts and the tool descriptions in server.ts).',
    tags: ['write-back'],
  },
  {
    type: 'decision',
    title: 'Budgeted two-tier retrieval: skeleton map plus expand-on-demand',
    summary: 'memory_search returns ~15-token skeletons under a hard budget (default 1500); memory_expand fetches full bodies by id.',
    body: 'The budget is a contract, not advisory — the formatter cuts hard and reports the cut. The agent spends tokens only on nodes it chose. This is the entire token-savings mechanism, and the meter that proves it is the planned VS Code differentiator.',
    tags: ['retrieval'],
  },
  {
    type: 'gotcha',
    title: 'Chrome print CSS fragments flex containers across pages',
    summary: 'Headless-Chrome PDF rendering strands half-empty pages when page content sits in flex columns; use display:block + margins.',
    body: 'Hit while rendering the roadmap PDF. Also: grid card containers need break-inside: avoid or their gap-color paints a stray band at the page break, and section eyebrows need break-inside/break-after: avoid to not orphan.',
    tags: ['pdf', 'css'],
  },
  {
    type: 'preference',
    title: 'Deliverables as local files, not hosted artifacts',
    summary: 'User wants PDFs/markdown in the repo; asked to remove a published claude.ai artifact.',
    confidence: 0.95,
  },
  {
    type: 'session',
    title: 'Session 2026-08-12: bootstrap',
    summary: 'Scaffolded the monorepo: core (vault/BM25/retrieval), MCP server with 4 tools, smoke test, seed, wiring.',
    body: 'Phase 0 of the roadmap in Trellis-Build-Plan.pdf. Gate: a fact written in one session/client is retrieved in another, unprompted.',
  },
];

async function main() {
  const vault = await loadVault(vaultDir);
  const now = new Date().toISOString();
  let created = 0;
  for (const input of SEEDS) {
    if (vault.nodes.has(slugify(input.title))) continue; // already seeded
    const node = createNode(vault, input, now);
    await writeNode(vault, node);
    created++;
    console.log(`seeded (${node.type}) [${node.id}]`);
  }
  console.log(`done: ${created} new, ${vault.nodes.size} total nodes in ${vaultDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
