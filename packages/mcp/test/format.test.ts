import { describe, expect, it } from 'vitest';
import type { RetrievalResult, ScoredItem } from '@trellis/core';
import { estimateTokens, renderSearch, renderNode } from '../src/format';

const session = { searches: 1, expands: 0, writes: 0, links: 0 };

function item(i: number, pad = 0): ScoredItem {
  return {
    id: `node-${i}`,
    type: 'decision',
    title: `Title ${i} ${'x'.repeat(pad)}`,
    summary: `Summary sentence number ${i} ${'y'.repeat(pad)}`,
    confidence: 0.9,
    updated: '2026-08-12T00:00:00.000Z',
    score: 1 / (i + 1),
    hops: 0,
  };
}

function result(n: number, pad = 0): RetrievalResult {
  return {
    items: Array.from({ length: n }, (_, i) => item(i, pad)),
    seeds: [],
    graphNodes: n,
    graphEdges: 0,
  };
}

describe('renderSearch budget contract', () => {
  it('never exceeds the budget, even at the 100-token floor with max-length fields', () => {
    for (const budget of [100, 150, 300, 1500]) {
      // pad pushes titles/summaries toward their schema maxima
      const out = renderSearch(result(40, 60), budget, session);
      expect(estimateTokens(out), `budget ${budget}`).toBeLessThanOrEqual(budget);
    }
  });

  it('reports the cut when items are dropped', () => {
    const out = renderSearch(result(40, 60), 300, session);
    expect(out).toMatch(/budget reached: \d+ of 40 shown/);
  });

  it('shows everything when the budget allows', () => {
    const out = renderSearch(result(3), 1500, session);
    expect(out).toContain('[node-0]');
    expect(out).toContain('[node-2]');
    expect(out).not.toContain('budget reached');
  });
});

describe('renderNode superseded banner', () => {
  const node = {
    id: 'old-decision', type: 'decision' as const, title: 'Old way',
    summary: 'The old approach.', confidence: 0.9, tags: [],
    created: '2026-01-01T00:00:00.000Z', updated: '2026-01-01T00:00:00.000Z',
    last_confirmed: '2026-01-01T00:00:00.000Z', edges: [], body: 'details', path: '',
  };

  it('marks superseded nodes as historical', () => {
    const out = renderNode(node, 'new-decision');
    expect(out).toContain('SUPERSEDED');
    expect(out).toContain('[new-decision]');
  });

  it('no banner for current nodes', () => {
    expect(renderNode(node)).not.toContain('SUPERSEDED');
  });
});
