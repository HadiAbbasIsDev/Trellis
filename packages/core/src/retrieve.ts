import { Bm25Index } from './bm25';
import { extractWikilinks } from './frontmatter';
import { buildSupersededBy, chainCurrent } from './graph';
import type { LoadedVault } from './vault';
import { resolveNode } from './vault';
import type { NodeType } from './types';

export interface RetrieveOptions {
  maxSeeds?: number; // default 5
  maxHops?: number; // default 2
  maxItems?: number; // hard cap before the formatter's token budget, default 60
  types?: NodeType[];
  now?: number; // epoch ms, injectable for tests
}

export interface ScoredItem {
  id: string;
  type: NodeType;
  title: string;
  summary: string;
  confidence: number;
  updated: string;
  score: number;
  hops: number; // 0 = direct text match (seed)
}

export interface RetrievalResult {
  items: ScoredItem[];
  seeds: string[];
  graphNodes: number;
  graphEdges: number;
}

const HOP_DECAY = 0.55; // neighbor inherits this fraction of parent activation
const RECENCY_HALF_LIFE_DAYS = 180;
const RECENCY_FLOOR = 0.25; // old facts fade, never vanish

export function buildIndex(vault: LoadedVault): Bm25Index {
  const docs = [...vault.nodes.values()].map((n) => ({
    id: n.id,
    fields: {
      title: n.title,
      summary: n.summary,
      tags: n.tags.join(' '),
      body: n.body,
    },
  }));
  return new Bm25Index(docs, { title: 3, summary: 2, tags: 2, body: 1 });
}

/**
 * Hybrid retrieval: BM25 seeds -> bounded graph expansion -> composite rank.
 * Superseded nodes are never returned; anything pointing at them redirects to
 * the current node, so acting on a reversed decision is structurally impossible.
 */
export function retrieve(
  vault: LoadedVault,
  index: Bm25Index,
  query: string,
  opts: RetrieveOptions = {},
): RetrievalResult {
  const now = opts.now ?? Date.now();
  const maxSeeds = opts.maxSeeds ?? 5;
  const maxHops = opts.maxHops ?? 2;
  const maxItems = opts.maxItems ?? 60;

  // --- supersedes chains: cycle-safe map (see graph.ts), target -> superseder
  const supersededBy = buildSupersededBy(vault);
  const currentOf = (id: string): string => chainCurrent(supersededBy, id);

  // --- adjacency: frontmatter edges + implicit body wikilinks, both directions
  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (a === b) return;
    (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b);
    (adj.get(b) ?? adj.set(b, new Set()).get(b)!).add(a);
  };
  let edgeCount = 0;
  for (const n of vault.nodes.values()) {
    edgeCount += n.edges.length;
    for (const e of n.edges) {
      const t = resolveNode(vault, e.to);
      if (t) link(n.id, t.id);
    }
    for (const w of extractWikilinks(n.body)) {
      const t = resolveNode(vault, w);
      if (t) link(n.id, t.id);
    }
  }

  // --- seeds: top BM25 hits, redirected through supersedes chains
  const hits = index.search(query, maxSeeds * 3);
  const topScore = hits[0]?.score ?? 0;
  const activation = new Map<string, { act: number; hops: number }>();
  const seeds: string[] = [];
  for (const h of hits) {
    if (seeds.length >= maxSeeds) break;
    const id = currentOf(h.id);
    if (activation.has(id) || !vault.nodes.has(id)) continue;
    if (supersededBy.has(id)) continue; // guard: a hidden node must not spend a seed slot
    activation.set(id, { act: topScore > 0 ? h.score / topScore : 0, hops: 0 });
    seeds.push(id);
  }

  // --- spread activation outward
  let frontier = [...seeds];
  for (let hop = 1; hop <= maxHops && frontier.length > 0; hop++) {
    const next: string[] = [];
    for (const id of frontier) {
      const parent = activation.get(id);
      if (!parent) continue;
      for (const nb0 of adj.get(id) ?? []) {
        const nb = currentOf(nb0);
        if (nb === id || !vault.nodes.has(nb)) continue;
        const act = parent.act * HOP_DECAY;
        const existing = activation.get(nb);
        if (!existing) {
          activation.set(nb, { act, hops: hop });
          next.push(nb);
        } else if (act > existing.act) {
          existing.act = act;
        }
      }
    }
    frontier = next;
  }

  // --- composite score: activation x confidence x recency
  const items: ScoredItem[] = [];
  for (const [id, a] of activation) {
    if (supersededBy.has(id)) continue; // belt & suspenders
    const n = vault.nodes.get(id);
    if (!n) continue;
    if (opts.types && opts.types.length > 0 && !opts.types.includes(n.type)) continue;
    const stamp = Date.parse(n.last_confirmed || n.updated || n.created);
    // Unparseable dates get the floor, not full freshness — corrupted
    // frontmatter must never outrank correctly dated facts.
    const recency = !Number.isFinite(stamp)
      ? RECENCY_FLOOR
      : Math.max(
          RECENCY_FLOOR,
          Math.exp((-Math.max(0, (now - stamp) / 86_400_000) * Math.LN2) / RECENCY_HALF_LIFE_DAYS),
        );
    items.push({
      id: n.id,
      type: n.type,
      title: n.title,
      summary: n.summary,
      confidence: n.confidence,
      updated: n.updated,
      score: a.act * n.confidence * recency,
      hops: a.hops,
    });
  }
  items.sort((x, y) => y.score - x.score);

  return {
    items: items.slice(0, maxItems),
    seeds,
    graphNodes: vault.nodes.size,
    graphEdges: edgeCount,
  };
}
