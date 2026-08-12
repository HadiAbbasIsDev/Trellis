import fs from 'node:fs';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  EDGE_TYPES,
  NODE_TYPES,
  buildIndex,
  buildSupersededBy,
  countEdges,
  createNode,
  findNearDuplicates,
  findSuperseder,
  loadVault,
  resolveEdges,
  resolveNode,
  retrieve,
  supersedesWouldCycle,
  updateNode,
  withVaultLock,
  writeNode,
  type Edge,
  type LoadedVault,
} from '@trellis/core';
import { estimateTokens, footer, renderNode, renderSearch, type SessionState } from './format';

const VERSION = '0.1.0';

// --- vault location: --vault flag > TRELLIS_VAULT env > <cwd>/.trellis
function vaultDir(): string {
  const argIdx = process.argv.indexOf('--vault');
  if (argIdx !== -1 && process.argv[argIdx + 1]) {
    return path.resolve(process.argv[argIdx + 1]!);
  }
  if (process.env.TRELLIS_VAULT) return path.resolve(process.env.TRELLIS_VAULT);
  return path.resolve(process.cwd(), '.trellis');
}

const VAULT_DIR = vaultDir();

/**
 * Session write-state (rung 02 of the write-back ladder). The MCP server
 * process lives for the whole agent session, so plain counters are enough.
 */
const session: SessionState = { searches: 0, expands: 0, writes: 0, links: 0 };

async function freshVault(): Promise<LoadedVault> {
  // Full reload per call: correctness over speed at Phase 0 scale, and it
  // keeps concurrent sessions (Claude + Codex on one project) consistent.
  return loadVault(VAULT_DIR);
}

/**
 * In-process serialization: concurrent tool calls interleaving their
 * load→write spans lost writes while returning success (proven by review).
 * Cross-process safety is withVaultLock on the write paths.
 */
let chain: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => {});
  return next;
}

function text(s: string, isError = false) {
  return { content: [{ type: 'text' as const, text: s }], ...(isError ? { isError: true } : {}) };
}

/**
 * Stats feed (rung 2.5) — INTERFACE CONTRACT with the VS Code meter: one JSON
 * line per successful tool call in <vault>/.stats/log.jsonl, shape
 * {ts, tool, tokens, pid}. Strictly best-effort: a full disk or bad perms must
 * never fail the tool call itself. The .stats dot-dir is already invisible to
 * loadVault, so the feed can't leak into the graph.
 */
function logStats(tool: string, responseText: string): void {
  try {
    const dir = path.join(VAULT_DIR, '.stats');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(
      path.join(dir, 'log.jsonl'),
      JSON.stringify({
        ts: new Date().toISOString(),
        tool,
        tokens: estimateTokens(responseText),
        pid: process.pid,
      }) + '\n',
    );
  } catch {
    /* best-effort by design */
  }
}

/** Success-path reply: record the stats line, then answer. Error paths use text(s, true) directly and stay out of the feed. */
function reply(tool: string, s: string) {
  logStats(tool, s);
  return text(s);
}

const server = new McpServer({ name: 'trellis', version: VERSION });

// ---------------------------------------------------------------- search
server.registerTool(
  'memory_search',
  {
    title: 'Search project memory',
    description:
      'Search this project\'s persistent memory graph: decisions (and why), constraints, gotchas (failures + fixes), user preferences, component roles, and domain vocabulary from ALL past sessions, written by any agent. CALL THIS FIRST when starting a task — it is far cheaper than re-deriving context from the codebase. Returns a compact skeleton map under a hard token budget; pass ids to memory_expand for full detail. Facts that were later superseded are automatically hidden.',
    inputSchema: {
      query: z.string().min(2).describe('What you are about to work on, in a few words. Code identifiers work well.'),
      budget_tokens: z.number().int().min(100).max(4000).optional()
        .describe('Hard ceiling for the response size. Default 1500.'),
      types: z.array(z.enum(NODE_TYPES)).optional()
        .describe('Restrict to these node types.'),
    },
  },
  ({ query, budget_tokens, types }) => serialize(async () => {
    try {
      const vault = await freshVault();
      const index = buildIndex(vault);
      const result = retrieve(vault, index, query, { types });
      session.searches++;
      return reply('memory_search', renderSearch(result, budget_tokens ?? 1500, session));
    } catch (err) {
      return text(`memory_search failed: ${(err as Error).message}`, true);
    }
  }),
);

// ---------------------------------------------------------------- expand
server.registerTool(
  'memory_expand',
  {
    title: 'Expand memory nodes',
    description:
      'Fetch the full content of memory nodes by id (ids come from memory_search results). Spend tokens only on the nodes you actually need — the skeleton map is usually enough to decide.',
    inputSchema: {
      ids: z.array(z.string()).min(1).max(8).describe('Node ids to expand.'),
    },
  },
  ({ ids }) => serialize(async () => {
    try {
      const vault = await freshVault();
      const superseded = buildSupersededBy(vault);
      const found: string[] = [];
      const missing: string[] = [];
      for (const id of ids) {
        const n = resolveNode(vault, id);
        // search hides superseded nodes; expand must not silently un-hide
        // them, so they carry an explicit banner naming the current node
        if (n) found.push(renderNode(n, findSuperseder(vault, n.id, superseded)));
        else missing.push(id);
      }
      session.expands++;
      const parts = [...found];
      if (missing.length > 0) parts.push(`not found: ${missing.join(', ')}`);
      parts.push(footer(session));
      return reply('memory_expand', parts.join('\n\n'));
    } catch (err) {
      return text(`memory_expand failed: ${(err as Error).message}`, true);
    }
  }),
);

// ---------------------------------------------------------------- write
server.registerTool(
  'memory_write',
  {
    title: 'Record project memory',
    description:
      'Record a durable fact into the project memory graph THE MOMENT you learn it — do not wait for session end. Record: a decision and its why; a constraint; a gotcha (what failed + the fix); a user preference about how to work; a component\'s role; domain vocabulary. Do NOT record things the code or git history already state. Keep title ≤100 chars and summary to one sentence — they are what future searches see. Details go in body (markdown; link related nodes with [[node-id]]). To update an existing node instead of creating one, pass its id. If the response warns of a near-duplicate, update that node or link it (memory_link) instead of leaving a near-copy.',
    inputSchema: {
      type: z.enum(NODE_TYPES).describe('decision | constraint | component | entity | preference | gotcha | session'),
      title: z.string().min(3).max(120).describe('Short, specific, searchable.'),
      summary: z.string().min(3).max(300).describe('One sentence; shown in every search result.'),
      body: z.string().max(8000).optional().describe('Optional details, markdown with [[wikilinks]].'),
      tags: z.array(z.string()).max(10).optional(),
      confidence: z.number().min(0).max(1).optional().describe('Default 0.8. Use lower for hunches.'),
      edges: z.array(z.object({
        rel: z.enum(EDGE_TYPES),
        to: z.string().describe('Target node id'),
      })).max(12).optional()
        .describe('Typed links. Use supersedes when this replaces an earlier decision — the old node is then hidden from retrieval.'),
      id: z.string().optional().describe('Pass an existing node id to update it instead of creating a new node.'),
    },
  },
  ({ type, title, summary, body, tags, confidence, edges, id }) => serialize(() => withVaultLock(VAULT_DIR, async () => {
    try {
      const vault = await freshVault();
      const now = new Date().toISOString();
      const { edges: resolved, unresolved, dropped } = resolveEdges(vault, edges as Edge[] | undefined);
      const notes: string[] = [];
      const cycleDropped = new Set<string>(); // keep the forward-ref note honest
      if (dropped.length > 0) {
        notes.push(`dropped unresolvable edge target(s): ${dropped.join(', ')} — targets must contain letters or digits.`);
      }

      if (id) {
        const existing = resolveNode(vault, id);
        if (!existing) return text(`memory_write: no node with id "${id}". Omit id to create a new node.`, true);
        if (type !== existing.type) {
          notes.push(`note: type is immutable — kept (${existing.type}). To re-classify, create a new node and link it with supersedes.`);
        }
        // a supersedes edge that closes a loop would black-hole both nodes
        const safeEdges = resolved.filter((e) => {
          if (e.rel !== 'supersedes' || !vault.nodes.has(e.to)) return true;
          if (supersedesWouldCycle(vault, existing.id, e.to)) {
            notes.push(`dropped edge supersedes → ${e.to}: it would create a supersedes cycle. Use contradicts, or supersede both with a new node.`);
            cycleDropped.add(e.to);
            return false;
          }
          return true;
        });
        const updated = updateNode(existing, { title, summary, body, tags, confidence, edges: safeEdges }, now);
        await writeNode(vault, updated);
        session.writes++;
        notes.push(`updated (${updated.type}) [${updated.id}] ${updated.title}`);
      } else {
        const dupes = findNearDuplicates(vault, type, title, summary);
        const node = createNode(vault, { type, title, summary, body, tags, confidence, edges: [] }, now);
        // Cycle check on CREATE too — forward references let two creates
        // close a mutual supersedes that memory_link would refuse (proven by
        // review). A stub with the prospective id makes stored forward refs
        // to this very node resolvable during the walk.
        vault.nodes.set(node.id, { ...node, edges: resolved });
        const safeEdges = resolved.filter((e) => {
          if (e.rel !== 'supersedes') return true;
          if (supersedesWouldCycle(vault, node.id, e.to)) {
            notes.push(`dropped edge supersedes → ${e.to}: it would create a supersedes cycle. Use contradicts, or supersede both with a new node.`);
            cycleDropped.add(e.to);
            return false;
          }
          return true;
        });
        vault.nodes.delete(node.id);
        node.edges = safeEdges;
        await writeNode(vault, node);
        session.writes++;
        notes.push(`recorded (${node.type}) [${node.id}] ${node.title}`);
        if (dupes.length > 0) {
          notes.push(
            `⚠ near-duplicates exist: ${dupes.map((d) => `[${d.id}] (${Math.round(d.similarity * 100)}%)`).join(', ')}. ` +
            'If this restates one of them, update that node (memory_write with its id) or link it with memory_link, and consider supersedes.',
          );
        }
      }
      const stillForward = unresolved.filter((u) => !cycleDropped.has(u));
      if (stillForward.length > 0) {
        notes.push(`note: edge target(s) not found yet: ${stillForward.join(', ')} — kept as forward references.`);
      }
      notes.push(`graph: ${vault.nodes.size} nodes, ${countEdges(vault)} edges`);
      notes.push(footer(session));
      return reply('memory_write', notes.join('\n'));
    } catch (err) {
      return text(`memory_write failed: ${(err as Error).message}`, true);
    }
  })),
);

// ---------------------------------------------------------------- link
server.registerTool(
  'memory_link',
  {
    title: 'Link memory nodes',
    description:
      'Add a typed edge between two existing memory nodes. Use supersedes when a new decision replaces an old one (the superseded node is hidden from future retrieval and searches redirect to the current one). Use contradicts to flag a conflict, depends_on / implements for structure, observed_in for provenance, relates_to as the weakest link.',
    inputSchema: {
      from: z.string().describe('Source node id'),
      rel: z.enum(EDGE_TYPES),
      to: z.string().describe('Target node id'),
    },
  },
  ({ from, rel, to }) => serialize(() => withVaultLock(VAULT_DIR, async () => {
    try {
      const vault = await freshVault();
      const src = resolveNode(vault, from);
      const dst = resolveNode(vault, to);
      if (!src) return text(`memory_link: source "${from}" not found.`, true);
      if (!dst) return text(`memory_link: target "${to}" not found.`, true);
      if (src.id === dst.id) return text('memory_link: cannot link a node to itself.', true);
      if (src.edges.some((e) => e.rel === rel && e.to === dst.id)) {
        return reply('memory_link', `edge already exists: [${src.id}] ${rel} → [${dst.id}]\n${footer(session)}`);
      }
      if (rel === 'supersedes' && supersedesWouldCycle(vault, src.id, dst.id)) {
        return text(
          `memory_link: refused — [${dst.id}] already supersedes [${src.id}] (directly or through a chain), so this edge would create a cycle and hide both nodes. ` +
          'If the older decision is current again, create a NEW node stating it and have that supersede the newer one, or mark the pair with contradicts.',
          true,
        );
      }
      const now = new Date().toISOString();
      const updated = updateNode(src, { edges: [{ rel: rel as Edge['rel'], to: dst.id }] }, now);
      await writeNode(vault, updated);
      session.links++;
      const extra = rel === 'supersedes'
        ? ` — [${dst.id}] is now hidden from retrieval in favor of [${src.id}]`
        : '';
      return reply('memory_link', `linked: [${src.id}] ${rel} → [${dst.id}]${extra}\n${footer(session)}`);
    } catch (err) {
      return text(`memory_link failed: ${(err as Error).message}`, true);
    }
  })),
);

// ---------------------------------------------------------------- boot
async function main() {
  // stderr is the MCP logging channel; stdout carries the protocol.
  console.error(`trellis v${VERSION} · vault: ${VAULT_DIR}`);
  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error('trellis fatal:', err);
  process.exit(1);
});
