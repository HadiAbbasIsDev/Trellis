import { describe, expect, it } from 'vitest';
import {
  buildIndex,
  retrieve,
  type LoadedVault,
  type MemoryNode,
} from '@trellis/core';

const NOW = '2026-08-01T00:00:00.000Z';
const NOW_MS = Date.parse(NOW);
const DAY_MS = 86_400_000;

function mk(id: string, over: Partial<MemoryNode> = {}): MemoryNode {
  return {
    id,
    type: 'decision',
    title: id,
    summary: '',
    confidence: 1,
    tags: [],
    created: NOW,
    updated: NOW,
    last_confirmed: NOW,
    edges: [],
    body: '',
    path: `/v/${id}.md`,
    ...over,
  };
}

function vaultOf(...nodes: MemoryNode[]): LoadedVault {
  return { dir: '/v', nodes: new Map(nodes.map((n) => [n.id, n])), warnings: [] };
}

function run(vault: LoadedVault, query: string, opts: Record<string, unknown> = {}) {
  return retrieve(vault, buildIndex(vault), query, { now: NOW_MS, ...opts });
}

describe('seeds', () => {
  it('text matches become hop-0 seeds, best BM25 hit first', () => {
    const vault = vaultOf(
      mk('n1', { title: 'gamma' }),
      mk('n2', { title: 'gamma extra words' }),
      mk('n3', { title: 'unrelated topic' }),
    );
    const res = run(vault, 'gamma');
    expect(res.seeds).toContain('n1');
    expect(res.seeds).toContain('n2');
    expect(res.seeds).not.toContain('n3');
    // shorter title with same term frequency scores higher under BM25 length norm
    expect(res.seeds[0]).toBe('n1');
    for (const s of res.seeds) {
      expect(res.items.find((i) => i.id === s)?.hops).toBe(0);
    }
  });

  it('maxSeeds caps the number of seeds', () => {
    const vault = vaultOf(
      mk('n1', { title: 'gamma one' }),
      mk('n2', { title: 'gamma two' }),
      mk('n3', { title: 'gamma three' }),
      mk('n4', { title: 'gamma four' }),
    );
    const res = run(vault, 'gamma', { maxSeeds: 2 });
    expect(res.seeds).toHaveLength(2);
  });

  it('maxItems caps the result list keeping the highest scores', () => {
    const vault = vaultOf(
      mk('n1', { title: 'gamma' }),
      mk('n2', { title: 'gamma padding words here' }),
      mk('n3', { title: 'gamma more padding words here' }),
    );
    const res = run(vault, 'gamma', { maxItems: 2 });
    expect(res.items).toHaveLength(2);
    expect(res.items[0]!.id).toBe('n1');
  });
});

describe('hop decay ordering', () => {
  it('activation decays 0.55 per hop and orders results seed > 1-hop > 2-hop', () => {
    const vault = vaultOf(
      mk('root', { title: 'zebra quantum', edges: [{ rel: 'relates_to', to: 'mid' }] }),
      mk('mid', { title: 'middle', edges: [{ rel: 'relates_to', to: 'far' }] }),
      mk('far', { title: 'faraway' }),
      mk('beyond', { title: 'past horizon', edges: [{ rel: 'relates_to', to: 'far' }] }),
    );
    const res = run(vault, 'zebra quantum');
    // confidence = 1 and zero age, so score === activation
    expect(res.items.map((i) => i.id)).toEqual(['root', 'mid', 'far']);
    expect(res.items.map((i) => i.hops)).toEqual([0, 1, 2]);
    expect(res.items[0]!.score).toBeCloseTo(1, 10);
    expect(res.items[1]!.score).toBeCloseTo(0.55, 10);
    expect(res.items[2]!.score).toBeCloseTo(0.55 * 0.55, 10);
    // 'beyond' sits 3 hops out (root -> mid -> far -> beyond); default maxHops=2 excludes it
  });

  it('maxHops bounds the expansion', () => {
    const vault = vaultOf(
      mk('root', { title: 'zebra quantum', edges: [{ rel: 'relates_to', to: 'mid' }] }),
      mk('mid', { title: 'middle', edges: [{ rel: 'relates_to', to: 'far' }] }),
      mk('far', { title: 'faraway' }),
    );
    const zeroHops = run(vault, 'zebra', { maxHops: 0 });
    expect(zeroHops.items.map((i) => i.id)).toEqual(['root']);
    const oneHop = run(vault, 'zebra', { maxHops: 1 });
    expect(oneHop.items.map((i) => i.id)).toEqual(['root', 'mid']);
  });

  it('body [[wikilinks]] create implicit adjacency', () => {
    const vault = vaultOf(
      mk('root', { title: 'zebra quantum', body: 'see [[mid]] for details' }),
      mk('mid', { title: 'middle' }),
    );
    const res = run(vault, 'zebra');
    expect(res.items.map((i) => i.id)).toEqual(['root', 'mid']);
    expect(res.items[1]!.hops).toBe(1);
  });
});

describe('supersedes redirect', () => {
  it('chain a -> b -> c: seed hit on a returns only c', () => {
    const vault = vaultOf(
      mk('a', { title: 'flamingo sunset' }),
      mk('b', { title: 'revision one', edges: [{ rel: 'supersedes', to: 'a' }] }),
      mk('c', { title: 'revision two', edges: [{ rel: 'supersedes', to: 'b' }] }),
    );
    const res = run(vault, 'flamingo');
    expect(res.seeds).toEqual(['c']);
    expect(res.items.map((i) => i.id)).toEqual(['c']);
  });

  it('neighbor expansion into a superseded node redirects to the current one', () => {
    const vault = vaultOf(
      mk('x', { title: 'walrus topic', edges: [{ rel: 'relates_to', to: 'a' }] }),
      mk('a', { title: 'old fact' }),
      mk('b', { title: 'new fact', edges: [{ rel: 'supersedes', to: 'a' }] }),
    );
    const res = run(vault, 'walrus');
    const ids = res.items.map((i) => i.id);
    expect(ids).toContain('x');
    expect(ids).toContain('b');
    expect(ids).not.toContain('a');
    expect(res.items.find((i) => i.id === 'b')!.hops).toBe(1);
  });

  it('superseded nodes never appear even when they match the query directly', () => {
    const vault = vaultOf(
      mk('a', { title: 'pelican rule old', summary: 'pelican pelican' }),
      mk('b', { title: 'pelican rule new', edges: [{ rel: 'supersedes', to: 'a' }] }),
    );
    const res = run(vault, 'pelican');
    expect(res.items.map((i) => i.id)).toEqual(['b']);
  });

  it('supersedes target given as a title-ish wikilink still redirects', () => {
    const vault = vaultOf(
      mk('old-plan', { title: 'ostrich migration' }),
      mk('new-plan', { title: 'newer plan', edges: [{ rel: 'supersedes', to: 'Old Plan' }] }),
    );
    const res = run(vault, 'ostrich');
    expect(res.items.map((i) => i.id)).toEqual(['new-plan']);
  });
});

describe('cycle safety', () => {
  it('mutual supersedes cycle is broken deterministically: one member stays current', () => {
    const vault = vaultOf(
      mk('p', { title: 'orbit alpha', edges: [{ rel: 'supersedes', to: 'q' }] }),
      mk('q', { title: 'orbit beta', edges: [{ rel: 'supersedes', to: 'p' }] }),
      mk('s', { title: 'orbit standalone' }),
    );
    const res = run(vault, 'orbit'); // must not hang
    const ids = res.items.map((i) => i.id);
    expect(ids).toContain('s');
    // Cycle winner = newest `updated`, id as tiebreak (equal dates here → 'p').
    // The topic must never black-hole: exactly one cycle member survives.
    expect(ids).toContain('p');
    expect(ids).not.toContain('q');
    // seeds never claim hidden nodes
    expect(res.seeds).not.toContain('q');
    expect(res.seeds).toContain('p');
  });

  it('cycle winner is the newest member, and chains into the cycle resolve to it', () => {
    const later = new Date(NOW_MS + DAY_MS).toISOString();
    const vault = vaultOf(
      mk('p', { title: 'comet alpha', edges: [{ rel: 'supersedes', to: 'q' }] }),
      mk('q', { title: 'comet beta', updated: later, edges: [{ rel: 'supersedes', to: 'p' }] }),
      // r is superseded by p, whose chain resolves into the cycle — r must
      // redirect to the winner instead of vanishing
      mk('r', { title: 'comet gamma origin' }),
    );
    vault.nodes.get('p')!.edges.push({ rel: 'supersedes', to: 'r' });
    const res = run(vault, 'comet');
    const ids = res.items.map((i) => i.id);
    expect(ids).toEqual(['q']); // q is newest → sole current node for the topic
  });

  it('self-supersedes edge is ignored and the node is still returned', () => {
    const vault = vaultOf(
      mk('z', { title: 'condor loop', edges: [{ rel: 'supersedes', to: 'z' }] }),
    );
    const res = run(vault, 'condor');
    expect(res.items.map((i) => i.id)).toEqual(['z']);
  });

  it('adjacency cycles terminate', () => {
    const vault = vaultOf(
      mk('c1', { title: 'triangle start', edges: [{ rel: 'relates_to', to: 'c2' }] }),
      mk('c2', { edges: [{ rel: 'relates_to', to: 'c3' }] }),
      mk('c3', { edges: [{ rel: 'relates_to', to: 'c1' }] }),
    );
    const res = run(vault, 'triangle', { maxHops: 10 });
    expect(res.items.map((i) => i.id).sort()).toEqual(['c1', 'c2', 'c3']);
  });
});

describe('types filter', () => {
  it('returns only requested types', () => {
    const vault = vaultOf(
      mk('d1', { type: 'decision', title: 'kumquat decision' }),
      mk('g1', { type: 'gotcha', title: 'kumquat gotcha' }),
    );
    const res = run(vault, 'kumquat', { types: ['gotcha'] });
    expect(res.items.map((i) => i.id)).toEqual(['g1']);
  });

  it('empty types array means no filter', () => {
    const vault = vaultOf(
      mk('d1', { type: 'decision', title: 'kumquat decision' }),
      mk('g1', { type: 'gotcha', title: 'kumquat gotcha' }),
    );
    const res = run(vault, 'kumquat', { types: [] });
    expect(res.items).toHaveLength(2);
  });

  it('filter applies after expansion: typed neighbors of an off-type seed are kept', () => {
    const vault = vaultOf(
      mk('d1', { type: 'decision', title: 'lantern topic', edges: [{ rel: 'observed_in', to: 'g1' }] }),
      mk('g1', { type: 'gotcha', title: 'a trap' }),
    );
    const res = run(vault, 'lantern', { types: ['gotcha'] });
    expect(res.items.map((i) => i.id)).toEqual(['g1']);
    expect(res.items[0]!.hops).toBe(1);
    expect(res.seeds).toEqual(['d1']);
  });
});

describe('recency', () => {
  it('halves the score after one 180-day half-life', () => {
    const stamp = new Date(NOW_MS - 180 * DAY_MS).toISOString();
    const vault = vaultOf(
      mk('h', { title: 'papaya', last_confirmed: stamp, updated: stamp, created: stamp }),
    );
    const res = run(vault, 'papaya');
    expect(res.items[0]!.score).toBeCloseTo(0.5, 10);
  });

  it('very old facts hit the 0.25 floor instead of vanishing', () => {
    const old = new Date(NOW_MS - 3650 * DAY_MS).toISOString();
    const vault = vaultOf(
      mk('fresh', { title: 'papaya' }),
      mk('stale', { title: 'papaya', last_confirmed: old, updated: old, created: old }),
    );
    const res = run(vault, 'papaya');
    expect(res.items.map((i) => i.id)).toEqual(['fresh', 'stale']);
    expect(res.items[0]!.score).toBeCloseTo(1, 10);
    expect(res.items[1]!.score).toBeCloseTo(0.25, 10);
  });

  it('last_confirmed takes precedence over an older updated stamp', () => {
    const old = new Date(NOW_MS - 3650 * DAY_MS).toISOString();
    const vault = vaultOf(
      mk('n', { title: 'papaya', updated: old, created: old, last_confirmed: NOW }),
    );
    const res = run(vault, 'papaya');
    expect(res.items[0]!.score).toBeCloseTo(1, 10);
  });

  it('confidence multiplies into the composite score', () => {
    const vault = vaultOf(
      mk('sure', { title: 'papaya', confidence: 1 }),
      mk('shaky', { title: 'papaya', confidence: 0.5 }),
    );
    const res = run(vault, 'papaya');
    expect(res.items.map((i) => i.id)).toEqual(['sure', 'shaky']);
    expect(res.items[1]!.score).toBeCloseTo(res.items[0]!.score * 0.5, 10);
  });
});

describe('degenerate inputs', () => {
  it('empty vault returns an empty result', () => {
    const vault = vaultOf();
    const res = run(vault, 'anything at all');
    expect(res.items).toEqual([]);
    expect(res.seeds).toEqual([]);
    expect(res.graphNodes).toBe(0);
    expect(res.graphEdges).toBe(0);
  });

  it('empty query returns no seeds and no items', () => {
    const vault = vaultOf(mk('n1', { title: 'something real' }));
    for (const q of ['', '   ', '!!!']) {
      const res = run(vault, q);
      expect(res.seeds).toEqual([]);
      expect(res.items).toEqual([]);
    }
  });

  it('query with no matches returns empty items but reports graph stats', () => {
    const vault = vaultOf(
      mk('n1', { title: 'aardvark', edges: [{ rel: 'relates_to', to: 'n2' }] }),
      mk('n2', { title: 'buffalo' }),
    );
    const res = run(vault, 'xylophone');
    expect(res.items).toEqual([]);
    expect(res.graphNodes).toBe(2);
    expect(res.graphEdges).toBe(1);
  });

  it('unparseable date stamps do not produce NaN scores', () => {
    const vault = vaultOf(
      mk('n1', { title: 'quince', created: 'not-a-date', updated: 'not-a-date', last_confirmed: 'not-a-date' }),
    );
    const res = run(vault, 'quince');
    expect(res.items).toHaveLength(1);
    expect(Number.isFinite(res.items[0]!.score)).toBe(true);
  });
});
