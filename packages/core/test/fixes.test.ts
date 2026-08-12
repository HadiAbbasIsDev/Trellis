/** Regression tests for the findings confirmed by the Phase 0 review fleet. */
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildSupersededBy,
  chainCurrent,
  createNode,
  findSuperseder,
  loadVault,
  nextId,
  parseNodeFile,
  resolveEdges,
  resolveNode,
  serializeNode,
  slugify,
  stripRelationsSection,
  supersedesWouldCycle,
  tokenize,
  withVaultLock,
  writeNode,
  type LoadedVault,
  type MemoryNode,
} from '@trellis/core';

const NOW = '2026-08-12T10:00:00.000Z';
const tmpDirs: string[] = [];
function tmpVault(): string {
  const d = mkdtempSync(path.join(os.tmpdir(), 'trellis-fix-'));
  tmpDirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function mk(id: string, over: Partial<MemoryNode> = {}): MemoryNode {
  return {
    id, type: 'decision', title: id, summary: '', confidence: 1, tags: [],
    created: NOW, updated: NOW, last_confirmed: NOW, edges: [], body: '', path: `/v/${id}.md`,
    ...over,
  };
}
function vaultOf(...nodes: MemoryNode[]): LoadedVault {
  return { dir: '/v', nodes: new Map(nodes.map((n) => [n.id, n])), warnings: [] };
}

describe('relations marker safety (data loss)', () => {
  it('marker quoted inline in prose is preserved', () => {
    const body = 'Trellis uses the marker `<!-- trellis:relations -->` internally.\n\nMore prose after.';
    expect(stripRelationsSection(body)).toBe(body);
  });

  it('marker at line start without the Relations heading is preserved', () => {
    const body = 'before\n<!-- trellis:relations -->\nnot a relations block\nafter';
    expect(stripRelationsSection(body)).toBe(body);
  });

  it('user content appended BELOW the generated block survives', () => {
    const raw = 'intro\n\n<!-- trellis:relations -->\n## Relations\n- supersedes → [[old]]\nuser note added in Obsidian';
    const stripped = stripRelationsSection(raw);
    expect(stripped).toContain('intro');
    expect(stripped).toContain('user note added in Obsidian');
    expect(stripped).not.toContain('## Relations');
  });

  it('roundtrip with marker-quoting body is lossless', () => {
    const n = mk('m', {
      body: 'Docs: the `<!-- trellis:relations -->` marker delimits generated edges.\n\nTail line.',
      edges: [{ rel: 'relates_to', to: 'other' }],
    });
    const parsed = parseNodeFile('/x/m.md', serializeNode(n), NOW, []);
    expect(parsed!.body).toBe(n.body);
  });
});

describe('unparseable files are loud and their names reserved', () => {
  it('BOM-prefixed note still parses', async () => {
    const dir = tmpVault();
    const n = mk('bom-note', { path: '' });
    const v: LoadedVault = { dir, nodes: new Map(), warnings: [], files: new Set() };
    await writeNode(v, n);
    writeFileSync(n.path, '﻿' + readFileSync(n.path, 'utf8'));
    const loaded = await loadVault(dir);
    expect(loaded.nodes.has('bom-note')).toBe(true);
  });

  it('broken YAML warns, and a same-slug create does NOT clobber the file', async () => {
    const dir = tmpVault();
    const v: LoadedVault = { dir, nodes: new Map(), warnings: [], files: new Set() };
    const good = mk('build-fails', { path: '', body: 'Months of hard-won debugging notes' });
    await writeNode(v, good);
    // corrupt it the way a hand edit would
    writeFileSync(good.path, '---\ntype: decision\ntitle: "unclosed\n---\nMonths of hard-won debugging notes\n');
    const loaded = await loadVault(dir);
    expect(loaded.nodes.has('build-fails')).toBe(false);
    expect(loaded.warnings.some((w) => w.includes('unparseable frontmatter'))).toBe(true);
    // the filename is reserved: a new create with the same title gets a suffix
    expect(nextId(loaded, 'Build Fails')).toBe('build-fails-2');
    const fresh = createNode(loaded, { type: 'decision', title: 'Build Fails', summary: 's' }, NOW);
    await writeNode(loaded, fresh);
    expect(readFileSync(path.join(dir, 'decisions/build-fails.md'), 'utf8')).toContain('hard-won');
  });

  it('writeNode refuses to overwrite an unowned existing file', async () => {
    const dir = tmpVault();
    const v: LoadedVault = { dir, nodes: new Map(), warnings: [], files: new Set() };
    const first = mk('same-id', { path: '' });
    await writeNode(v, first);
    const rogue = mk('same-id', { path: '' }); // fresh create, same id, stale snapshot
    const v2: LoadedVault = { dir, nodes: new Map(), warnings: [], files: new Set() };
    await expect(writeNode(v2, rogue)).rejects.toThrow(/refusing to overwrite/);
  });
});

describe('duplicate ids resolve deterministically (newest wins)', () => {
  it('keeps the newer file regardless of readdir order', async () => {
    const dir = tmpVault();
    const older = mk('shared', { path: '', updated: '2026-01-01T00:00:00.000Z', body: 'OLD' });
    const newer = mk('shared', { path: '', updated: '2026-06-01T00:00:00.000Z', body: 'NEW' });
    const v: LoadedVault = { dir, nodes: new Map(), warnings: [], files: new Set() };
    await writeNode(v, older);
    // same id, different file (simulates a crash-window stale copy)
    const stalePath = path.join(dir, 'decisions/zz-stale-copy.md');
    writeFileSync(stalePath, serializeNode(newer));
    const loaded = await loadVault(dir);
    expect(loaded.nodes.get('shared')!.body).toBe('NEW');
    expect(loaded.warnings.some((w) => w.includes('duplicate id'))).toBe(true);
    expect(existsSync(stalePath)).toBe(true); // loser is never deleted at load
  });
});

describe('supersedes cycles (graph.ts)', () => {
  it('buildSupersededBy crowns the newest cycle member', () => {
    const later = '2026-08-13T00:00:00.000Z';
    const vault = vaultOf(
      mk('a', { edges: [{ rel: 'supersedes', to: 'b' }] }),
      mk('b', { updated: later, edges: [{ rel: 'supersedes', to: 'a' }] }),
    );
    const map = buildSupersededBy(vault);
    expect(map.has('b')).toBe(false);
    expect(chainCurrent(map, 'a')).toBe('b');
    expect(findSuperseder(vault, 'a', map)).toBe('b');
    expect(findSuperseder(vault, 'b', map)).toBeUndefined();
  });

  it('supersedesWouldCycle detects direct and transitive loops', () => {
    const vault = vaultOf(
      mk('c', { edges: [{ rel: 'supersedes', to: 'b' }] }),
      mk('b', { edges: [{ rel: 'supersedes', to: 'a' }] }),
      mk('a'),
    );
    expect(supersedesWouldCycle(vault, 'a', 'c')).toBe(true); // a→c closes c→b→a
    expect(supersedesWouldCycle(vault, 'a', 'b')).toBe(true);
    expect(supersedesWouldCycle(vault, 'c', 'a')).toBe(false); // already implied, no loop
    expect(supersedesWouldCycle(vault, 'x', 'x')).toBe(true); // self
  });
});

describe('unicode support', () => {
  it('non-Latin titles tokenize and slugify meaningfully', () => {
    expect(tokenize('إطلاق الميزة الجديدة').length).toBeGreaterThan(0);
    expect(slugify('🚀 إطلاق الميزة')).not.toBe('note');
    expect(slugify('Ünïcode Dïacritics')).toBe('unicode-diacritics');
  });

  it('punctuation-only refs never resolve to an unrelated node', () => {
    const vault = vaultOf(mk('note', { title: 'Note' }));
    expect(resolveNode(vault, '???')).toBeUndefined();
    expect(resolveNode(vault, 'note')?.id).toBe('note'); // legit lookups still work
  });
});

describe('round 2: re-attack findings', () => {
  it('UPDATE path also refuses to clobber a file the node was not loaded from', async () => {
    const dir = tmpVault();
    const v: LoadedVault = { dir, nodes: new Map(), warnings: [], files: new Set() };
    // an unparseable note owns decisions/precious.md
    const precious = mk('precious', { path: '', body: 'PRECIOUS USER DATA' });
    await writeNode(v, precious);
    writeFileSync(precious.path, '---\ntype: decision\ntitle: "unclosed\n---\nPRECIOUS USER DATA\n');
    // a different file claims id "precious" in its frontmatter
    const scratch = mk('precious', { path: '', body: 'scratch' });
    scratch.id = 'zz-scratch';
    const v2: LoadedVault = { dir, nodes: new Map(), warnings: [], files: new Set() };
    await writeNode(v2, scratch);
    let raw = readFileSync(scratch.path, 'utf8').replace('id: zz-scratch', 'id: precious');
    writeFileSync(scratch.path, raw);
    const loaded = await loadVault(dir);
    const node = loaded.nodes.get('precious')!;
    expect(node.path.endsWith('zz-scratch.md')).toBe(true);
    // updating it must NOT rename over precious.md
    await expect(writeNode(loaded, { ...node, summary: 'updated' })).rejects.toThrow(/refusing to overwrite/);
    expect(readFileSync(path.join(dir, 'decisions/precious.md'), 'utf8')).toContain('PRECIOUS USER DATA');
  });

  it('generated edge lines with "]" in the target still strip (no duplication growth)', () => {
    const n = mk('w', { body: 'prose', edges: [{ rel: 'relates_to', to: 'we]ird-target' }] });
    let raw = serializeNode(n);
    for (let i = 0; i < 3; i++) {
      const parsed = parseNodeFile('/x/w.md', raw, NOW, [])!;
      expect(parsed.body).toBe('prose');
      raw = serializeNode(parsed);
    }
    expect(raw.match(/## Relations/g)!.length).toBe(1);
  });

  it('user bullets with non-edge-type rels below the generated block survive', () => {
    const raw = 'intro\n\n<!-- trellis:relations -->\n## Relations\n- relates_to → [[foo]]\n- see → [[my own note]]\n- fixed_by → [[another user line]]';
    const stripped = stripRelationsSection(raw);
    expect(stripped).toContain('- see → [[my own note]]');
    expect(stripped).toContain('- fixed_by → [[another user line]]');
    expect(stripped).not.toContain('- relates_to → [[foo]]');
  });

  it('newline-containing edge targets are dropped on parse and sanitized on write', () => {
    // hand-authored YAML can smuggle a newline into `to`, which produced an
    // unstrippable two-line Relations bullet growing the file every write
    const warnings: string[] = [];
    const raw = '---\nid: source\ntype: decision\ntitle: t\nsummary: s\nedges:\n  - rel: relates_to\n    to: "x\\ny"\n---\nprose here\n';
    const parsed = parseNodeFile('/x/source.md', raw, NOW, warnings)!;
    expect(parsed.edges).toEqual([]);
    expect(warnings.some((w) => w.includes('malformed target'))).toBe(true);
    // and serializeNode keeps bullets single-line even if handed one directly
    const n = mk('source', { body: 'prose here', edges: [{ rel: 'relates_to', to: 'x\ny' }] });
    let cycle = serializeNode(n);
    const sizes: number[] = [cycle.length];
    for (let i = 0; i < 3; i++) {
      const p = parseNodeFile('/x/source.md', cycle, NOW, [])!;
      expect(p.body).toBe('prose here');
      cycle = serializeNode(p);
      sizes.push(cycle.length);
    }
    expect(new Set(sizes.slice(1)).size).toBe(1); // byte-stable after first normalization
  });

  it('resolveEdges slugifies forward refs and drops wordless targets', () => {
    const vault = vaultOf(mk('existing'));
    const res = resolveEdges(vault, [
      { rel: 'relates_to', to: 'existing' },
      { rel: 'depends_on', to: 'Future Note!' },
      { rel: 'relates_to', to: '???' },
    ]);
    expect(res.edges).toEqual([
      { rel: 'relates_to', to: 'existing' },
      { rel: 'depends_on', to: 'future-note' },
    ]);
    expect(res.unresolved).toEqual(['future-note']);
    expect(res.dropped).toEqual(['???']);
  });

  it('forward-reference mutual supersedes is detectable with a prospective stub', () => {
    // a stored: supersedes -> 'b' (forward ref); now creating b with supersedes -> a
    const vault = vaultOf(mk('a', { edges: [{ rel: 'supersedes', to: 'b' }] }));
    vault.nodes.set('b', mk('b', { edges: [{ rel: 'supersedes', to: 'a' }] })); // stub as server does
    expect(supersedesWouldCycle(vault, 'b', 'a')).toBe(true);
  });
});

describe('round 3: user frontmatter preservation', () => {
  it('unknown frontmatter keys (Obsidian aliases etc.) survive parse -> serialize', () => {
    const raw = '---\nid: n1\ntype: decision\ntitle: t\nsummary: s\naliases: [my-alias]\npriority: high\n---\nbody\n';
    const parsed = parseNodeFile('/x/n1.md', raw, NOW, [])!;
    expect(parsed.extra).toEqual({ aliases: ['my-alias'], priority: 'high' });
    const out = serializeNode(parsed);
    expect(out).toContain('aliases:');
    expect(out).toContain('priority: high');
    const again = parseNodeFile('/x/n1.md', out, NOW, [])!;
    expect(again.extra).toEqual(parsed.extra);
    expect(serializeNode(again)).toBe(out); // stable
  });

  it('extra keys can never shadow canonical keys', () => {
    const n = mk('n2', { extra: { id: 'EVIL', type: 'gotcha', custom: 1 } });
    const parsed = parseNodeFile('/x/n2.md', serializeNode(n), NOW, [])!;
    expect(parsed.id).toBe('n2');
    expect(parsed.type).toBe('decision');
    expect(parsed.extra).toEqual({ custom: 1 });
  });
});

describe('vault lock', () => {
  it('serializes competing critical sections', async () => {
    const dir = tmpVault();
    const order: string[] = [];
    await Promise.all([
      withVaultLock(dir, async () => {
        order.push('a-start');
        await new Promise((r) => setTimeout(r, 60));
        order.push('a-end');
      }),
      withVaultLock(dir, async () => {
        order.push('b-start');
        await new Promise((r) => setTimeout(r, 10));
        order.push('b-end');
      }),
    ]);
    const first = order[0]!.charAt(0);
    const expected = first === 'a'
      ? ['a-start', 'a-end', 'b-start', 'b-end']
      : ['b-start', 'b-end', 'a-start', 'a-end'];
    expect(order).toEqual(expected);
  });
});
