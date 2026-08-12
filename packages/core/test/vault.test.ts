import { afterAll, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  countEdges,
  createNode,
  loadVault,
  nextId,
  resolveEdges,
  resolveNode,
  serializeNode,
  updateNode,
  writeNode,
  type LoadedVault,
  type MemoryNode,
  type NodeInput,
} from '@trellis/core';

const NOW = '2026-08-01T00:00:00.000Z';
const LATER = '2026-08-02T12:00:00.000Z';

const tmpDirs: string[] = [];
async function tmpVaultDir(): Promise<string> {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'trellis-test-'));
  tmpDirs.push(d);
  return d;
}
afterAll(async () => {
  await Promise.all(tmpDirs.map((d) => fs.rm(d, { recursive: true, force: true })));
});

function memVault(...nodes: MemoryNode[]): LoadedVault {
  return { dir: '/v', nodes: new Map(nodes.map((n) => [n.id, n])), warnings: [] };
}

function mem(id: string, over: Partial<MemoryNode> = {}): MemoryNode {
  return {
    id,
    type: 'decision',
    title: id,
    summary: '',
    confidence: 0.8,
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

const input: NodeInput = {
  type: 'decision',
  title: 'Use BM25 For Search',
  summary: 'Pure TS ranking, no SQLite.',
  body: 'Rationale with a [[wikilink]].',
  tags: ['search', 'perf'],
  confidence: 0.7,
  edges: [{ rel: 'relates_to', to: 'other-node' }],
};

describe('load/write roundtrip', () => {
  it('loadVault on a missing dir returns an empty vault without throwing', async () => {
    const vault = await loadVault(path.join(os.tmpdir(), 'trellis-definitely-missing-xyz'));
    expect(vault.nodes.size).toBe(0);
    expect(vault.warnings).toEqual([]);
  });

  it('createNode + writeNode lands in the type folder and reloads identically', async () => {
    const dir = await tmpVaultDir();
    const vault = await loadVault(dir);
    const node = createNode(vault, input, NOW);
    expect(node.id).toBe('use-bm25-for-search');
    const written = await writeNode(vault, node);
    expect(written).toBe(path.join(dir, 'decisions', 'use-bm25-for-search.md'));
    await fs.access(written); // file exists

    const reloaded = await loadVault(dir);
    expect(reloaded.warnings).toEqual([]);
    expect(reloaded.nodes.size).toBe(1);
    const got = reloaded.nodes.get('use-bm25-for-search')!;
    expect(got.type).toBe('decision');
    expect(got.title).toBe(input.title);
    expect(got.summary).toBe(input.summary);
    expect(got.confidence).toBe(0.7);
    expect(got.tags).toEqual(['search', 'perf']);
    expect(got.created).toBe(NOW);
    expect(got.updated).toBe(NOW);
    expect(got.last_confirmed).toBe(NOW);
    expect(got.edges).toEqual([{ rel: 'relates_to', to: 'other-node' }]);
    expect(got.body).toBe('Rationale with a [[wikilink]].');
    expect(got.path).toBe(written);
    expect(countEdges(reloaded)).toBe(1);
  });

  it('writeNode moves the file when the type folder changes and removes the stale copy', async () => {
    const dir = await tmpVaultDir();
    const vault = await loadVault(dir);
    const node = createNode(vault, { type: 'decision', title: 'Mover', summary: 's' }, NOW);
    const oldPath = await writeNode(vault, node);
    node.type = 'gotcha';
    const newPath = await writeNode(vault, node);
    expect(newPath).toBe(path.join(dir, 'gotchas', 'mover.md'));
    await expect(fs.access(oldPath)).rejects.toThrow();
    const reloaded = await loadVault(dir);
    expect(reloaded.nodes.size).toBe(1);
    expect(reloaded.nodes.get('mover')!.type).toBe('gotcha');
  });

  it('frontmatter id wins over the filename on load', async () => {
    const dir = await tmpVaultDir();
    await fs.mkdir(path.join(dir, 'decisions'), { recursive: true });
    const raw = serializeNode(mem('custom-id', { title: 'Custom' }));
    await fs.writeFile(path.join(dir, 'decisions', 'some-other-filename.md'), raw, 'utf8');
    const vault = await loadVault(dir);
    expect(vault.nodes.has('custom-id')).toBe(true);
    expect(vault.nodes.has('some-other-filename')).toBe(false);
  });

  it('skips dot-directories and non-markdown files, warns on duplicate ids', async () => {
    const dir = await tmpVaultDir();
    const vault = await loadVault(dir);
    await writeNode(vault, createNode(vault, { type: 'decision', title: 'Solo', summary: 's' }, NOW));
    // plain README and a text file are ignored silently
    await fs.writeFile(path.join(dir, 'README.md'), '# vault\n', 'utf8');
    await fs.writeFile(path.join(dir, 'notes.txt'), 'not markdown\n', 'utf8');
    // a note inside a dot-directory must be skipped
    await fs.mkdir(path.join(dir, '.obsidian'), { recursive: true });
    await fs.writeFile(
      path.join(dir, '.obsidian', 'cache.md'),
      serializeNode(mem('hidden-note')),
      'utf8',
    );
    // duplicate id in another folder warns and keeps the first
    await fs.mkdir(path.join(dir, 'gotchas'), { recursive: true });
    await fs.writeFile(
      path.join(dir, 'gotchas', 'dup.md'),
      serializeNode(mem('solo', { type: 'gotcha' })),
      'utf8',
    );
    const reloaded = await loadVault(dir);
    expect(reloaded.nodes.size).toBe(1);
    expect(reloaded.nodes.has('solo')).toBe(true);
    expect(reloaded.nodes.has('hidden-note')).toBe(false);
    expect(reloaded.warnings).toHaveLength(1);
    expect(reloaded.warnings[0]).toContain('duplicate id');
  });
});

describe('nextId collisions', () => {
  it('appends -2, -3, ... when the slug is taken', async () => {
    const dir = await tmpVaultDir();
    const vault = await loadVault(dir);
    const n1 = createNode(vault, { type: 'decision', title: 'Foo Bar', summary: 's' }, NOW);
    expect(n1.id).toBe('foo-bar');
    await writeNode(vault, n1);
    const n2 = createNode(vault, { type: 'decision', title: 'Foo Bar!', summary: 's' }, NOW);
    expect(n2.id).toBe('foo-bar-2');
    await writeNode(vault, n2);
    const n3 = createNode(vault, { type: 'decision', title: 'foo bar', summary: 's' }, NOW);
    expect(n3.id).toBe('foo-bar-3');
  });

  it('falls back to a timestamp suffix after 99 collisions and never collides', () => {
    const nodes = [mem('foo')];
    for (let i = 2; i < 100; i++) nodes.push(mem(`foo-${i}`));
    const vault = memVault(...nodes);
    const id = nextId(vault, 'Foo');
    expect(id.startsWith('foo-')).toBe(true);
    expect(vault.nodes.has(id)).toBe(false);
  });
});

describe('resolveNode', () => {
  const vault = memVault(mem('api-gateway', { title: 'API Gateway' }));

  it('resolves an exact id', () => {
    expect(resolveNode(vault, 'api-gateway')?.id).toBe('api-gateway');
  });

  it('resolves case-insensitively', () => {
    expect(resolveNode(vault, 'API-Gateway')?.id).toBe('api-gateway');
  });

  it('falls back to the slugified reference (title-style wikilinks)', () => {
    expect(resolveNode(vault, 'API Gateway')?.id).toBe('api-gateway');
    expect(resolveNode(vault, 'API Gateway!')?.id).toBe('api-gateway');
  });

  it('returns undefined for unknown references', () => {
    expect(resolveNode(vault, 'does-not-exist')).toBeUndefined();
  });
});

describe('resolveEdges', () => {
  it('canonicalizes resolvable targets and keeps forward references', () => {
    const vault = memVault(mem('target-node', { title: 'Target Node' }));
    const { edges, unresolved } = resolveEdges(vault, [
      { rel: 'relates_to', to: 'Target Node' },
      { rel: 'depends_on', to: 'ghost' },
    ]);
    expect(edges).toEqual([
      { rel: 'relates_to', to: 'target-node' },
      { rel: 'depends_on', to: 'ghost' },
    ]);
    expect(unresolved).toEqual(['ghost']);
  });
});

describe('createNode defaults', () => {
  it('fills defaults and trims text fields', () => {
    const vault = memVault();
    const n = createNode(
      vault,
      { type: 'gotcha', title: '  Padded Title  ', summary: ' s ' },
      NOW,
    );
    expect(n.title).toBe('Padded Title');
    expect(n.summary).toBe('s');
    expect(n.confidence).toBe(0.8);
    expect(n.tags).toEqual([]);
    expect(n.edges).toEqual([]);
    expect(n.body).toBe('');
    expect(n.created).toBe(NOW);
    expect(n.updated).toBe(NOW);
    expect(n.last_confirmed).toBe(NOW);
  });
});

describe('updateNode', () => {
  it('merges patch edges into existing ones, deduped by rel+to', () => {
    const node = mem('n', { edges: [{ rel: 'depends_on', to: 'x' }] });
    const out = updateNode(
      node,
      {
        edges: [
          { rel: 'depends_on', to: 'x' }, // exact duplicate — dropped
          { rel: 'relates_to', to: 'x' }, // same target, different rel — kept
          { rel: 'depends_on', to: 'y' }, // same rel, different target — kept
        ],
      },
      LATER,
    );
    expect(out.edges).toEqual([
      { rel: 'depends_on', to: 'x' },
      { rel: 'relates_to', to: 'x' },
      { rel: 'depends_on', to: 'y' },
    ]);
  });

  it('bumps updated/last_confirmed, preserves created, applies field patches', () => {
    const node = mem('n', { title: 'Old', summary: 'old sum', body: 'old body', tags: ['a'] });
    const out = updateNode(
      node,
      { title: '  New Title  ', body: 'new body', tags: ['b', 'c'], confidence: 0.4 },
      LATER,
    );
    expect(out.title).toBe('New Title');
    expect(out.summary).toBe('old sum'); // untouched
    expect(out.body).toBe('new body');
    expect(out.tags).toEqual(['b', 'c']);
    expect(out.confidence).toBe(0.4);
    expect(out.created).toBe(NOW);
    expect(out.updated).toBe(LATER);
    expect(out.last_confirmed).toBe(LATER);
    // original untouched (updateNode is pure)
    expect(node.title).toBe('Old');
    expect(node.updated).toBe(NOW);
  });

  it('an explicit empty body clears it; an empty patch changes nothing but stamps', () => {
    const node = mem('n', { body: 'text' });
    expect(updateNode(node, { body: '' }, LATER).body).toBe('');
    const untouched = updateNode(node, {}, LATER);
    expect(untouched.title).toBe(node.title);
    expect(untouched.body).toBe('text');
    expect(untouched.edges).toEqual(node.edges);
  });

  it('updateNode + writeNode roundtrips through disk', async () => {
    const dir = await tmpVaultDir();
    const vault = await loadVault(dir);
    const node = createNode(vault, input, NOW);
    await writeNode(vault, node);
    const patched = updateNode(node, { edges: [{ rel: 'depends_on', to: 'dep' }] }, LATER);
    await writeNode(vault, patched);
    const reloaded = await loadVault(dir);
    const got = reloaded.nodes.get('use-bm25-for-search')!;
    expect(got.edges).toEqual([
      { rel: 'relates_to', to: 'other-node' },
      { rel: 'depends_on', to: 'dep' },
    ]);
    expect(got.updated).toBe(LATER);
    expect(got.created).toBe(NOW);
  });
});
