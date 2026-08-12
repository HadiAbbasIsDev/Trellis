import { describe, expect, it } from 'vitest';
import {
  extractWikilinks,
  parseNodeFile,
  serializeNode,
  slugify,
  stripRelationsSection,
  tokenize,
  type MemoryNode,
} from '@trellis/core';

const NOW = '2026-08-12T10:00:00.000Z';

function sample(over: Partial<MemoryNode> = {}): MemoryNode {
  return {
    id: 'test-node',
    type: 'decision',
    title: 'Test node: with a colon',
    summary: 'A summary with "quotes" and — dashes.',
    confidence: 0.9,
    tags: ['a', 'b'],
    created: NOW,
    updated: NOW,
    last_confirmed: NOW,
    edges: [{ rel: 'supersedes', to: 'old-node' }],
    body: 'Body with a [[wikilink]] and code `getUserId`.',
    path: '',
    ...over,
  };
}

describe('serialize → parse roundtrip', () => {
  it('preserves every field through disk format', () => {
    const original = sample();
    const raw = serializeNode(original);
    const warnings: string[] = [];
    const parsed = parseNodeFile('/x/test-node.md', raw, NOW, warnings);
    expect(warnings).toEqual([]);
    expect(parsed).not.toBeNull();
    expect(parsed!.id).toBe(original.id);
    expect(parsed!.title).toBe(original.title);
    expect(parsed!.summary).toBe(original.summary);
    expect(parsed!.edges).toEqual(original.edges);
    expect(parsed!.body).toBe(original.body); // Relations section stripped back out
  });

  it('regenerated Relations section does not leak into implicit links', () => {
    const raw = serializeNode(sample());
    const parsed = parseNodeFile('/x/test-node.md', raw, NOW, []);
    // body wikilink survives; frontmatter edge target does NOT appear as body link
    expect(extractWikilinks(parsed!.body)).toEqual(['wikilink']);
  });

  it('double roundtrip is stable', () => {
    const once = serializeNode(sample());
    const parsed = parseNodeFile('/x/test-node.md', once, NOW, []);
    const twice = serializeNode(parsed!);
    expect(twice).toBe(once);
  });
});

describe('non-note files', () => {
  it('plain markdown without frontmatter is ignored silently', () => {
    const warnings: string[] = [];
    expect(parseNodeFile('/x/README.md', '# hi\n', NOW, warnings)).toBeNull();
    expect(warnings).toEqual([]);
  });

  it('unknown type warns and skips', () => {
    const warnings: string[] = [];
    const raw = '---\ntype: wisdom\ntitle: t\n---\nbody\n';
    expect(parseNodeFile('/x/w.md', raw, NOW, warnings)).toBeNull();
    expect(warnings.length).toBe(1);
  });
});

describe('tokenize', () => {
  it('splits code identifiers both ways', () => {
    const toks = tokenize('getUserId');
    expect(toks).toContain('get');
    expect(toks).toContain('user');
    expect(toks).toContain('id');
    expect(toks).toContain('getuserid');
  });

  it('handles snake_case', () => {
    expect(tokenize('memory_write')).toContain('memory');
    expect(tokenize('memory_write')).toContain('write');
  });
});

describe('slugify', () => {
  it('kebab-cases and strips punctuation', () => {
    expect(slugify('Use pure-TS BM25, not SQLite!')).toBe('use-pure-ts-bm25-not-sqlite');
  });
  it('never returns empty', () => {
    expect(slugify('!!!')).toBe('note');
  });
});

describe('stripRelationsSection', () => {
  it('is a no-op without the marker', () => {
    expect(stripRelationsSection('plain body')).toBe('plain body');
  });
});
