import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  NODE_TYPES,
  buildSupersededBy,
  chainCurrent,
  findNearDuplicates,
  loadVault,
  type LoadedVault,
} from '@trellis/core';
import { grepTerms, runEval, type EvalReport, type Question } from '../src/run';

const PKG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VAULT_DIR = path.join(PKG_DIR, 'bench-vault');

// This suite asserts the harness EXECUTES and the benchmark is honestly
// constructed — it deliberately does not assert who wins. The gate verdict
// belongs in eval-report.md, not in CI, so a regression in retrieval turns
// the report red instead of blocking unrelated work.
describe('bench vault structure', () => {
  let vault: LoadedVault;
  beforeAll(async () => {
    vault = await loadVault(VAULT_DIR);
  });

  it('loads 55-70 nodes without warnings and covers all 7 types', () => {
    expect(vault.nodes.size).toBeGreaterThanOrEqual(55);
    expect(vault.nodes.size).toBeLessThanOrEqual(70);
    expect(vault.warnings).toEqual([]);
    for (const t of NODE_TYPES) {
      expect([...vault.nodes.values()].some((n) => n.type === t), `missing type ${t}`).toBe(true);
    }
  });

  it('contains at least 2 supersedes chains, one of length >= 2', () => {
    const map = buildSupersededBy(vault);
    expect(map.size).toBeGreaterThanOrEqual(3);
    // distinct chain heads = distinct current nodes reached from superseded ones
    const heads = new Set([...map.keys()].map((id) => chainCurrent(map, id)));
    expect(heads.size).toBeGreaterThanOrEqual(2);
    // the mongodb -> jsonb -> normalized chain needs two redirect steps
    expect(chainCurrent(map, 'mongodb-for-flexible-schedule-documents')).toBe(
      'normalize-schedule-tables-drop-jsonb',
    );
  });

  it('contains the two intended near-duplicate pairs (Jaccard >= 0.5)', () => {
    const pairs: [string, string][] = [
      ['no-default-exports', 'avoid-default-exports-in-shared-packages'],
      [
        'stripe-webhook-retry-created-duplicate-invoice-rows',
        'stripe-webhook-redelivery-created-duplicate-invoice-rows',
      ],
    ];
    for (const [a, b] of pairs) {
      const node = vault.nodes.get(a)!;
      expect(node, a).toBeDefined();
      const dupes = findNearDuplicates(vault, node.type, node.title, node.summary);
      expect(dupes.map((d) => d.id), `${a} should near-duplicate ${b}`).toContain(b);
    }
  });
});

describe('questions', () => {
  let questions: Question[];
  let vault: LoadedVault;
  beforeAll(async () => {
    questions = JSON.parse(await fs.readFile(path.join(PKG_DIR, 'questions.json'), 'utf8'));
    vault = await loadVault(VAULT_DIR);
  });

  it('has exactly 50 with unique ids and the required category minimums', () => {
    expect(questions).toHaveLength(50);
    expect(new Set(questions.map((q) => q.id)).size).toBe(50);
    const count = (t: Question['type']) => questions.filter((q) => q.type === t).length;
    expect(count('multi-hop')).toBeGreaterThanOrEqual(8);
    expect(count('superseded')).toBeGreaterThanOrEqual(5);
    expect(count('negative')).toBeGreaterThanOrEqual(4);
  });

  it('expected ids exist; negatives expect nothing; superseded expect CURRENT nodes', () => {
    const superseded = buildSupersededBy(vault);
    for (const q of questions) {
      if (q.type === 'negative') {
        expect(q.expect, q.id).toEqual([]);
        continue;
      }
      expect(q.expect.length, q.id).toBeGreaterThan(0);
      for (const id of q.expect) {
        expect(vault.nodes.has(id), `${q.id}: unknown expected id ${id}`).toBe(true);
        if (q.type === 'superseded') {
          // expecting a hidden node would invert the metric's meaning
          expect(superseded.has(id), `${q.id}: expected id ${id} is itself superseded`).toBe(false);
        }
      }
    }
  });

  it('multi-hop questions are pure: expected files contain no query term', async () => {
    // If a term leaks into the expected file, a plain grep finds the answer
    // directly and the question silently stops measuring graph traversal.
    for (const q of questions.filter((x) => x.type === 'multi-hop')) {
      for (const id of q.expect) {
        const raw = (await fs.readFile(vault.nodes.get(id)!.path, 'utf8')).toLowerCase();
        for (const term of grepTerms(q.query)) {
          expect(raw.includes(term), `${q.id}: "${term}" appears in ${id}`).toBe(false);
        }
      }
    }
  });
});

describe('runEval end-to-end', () => {
  let report: EvalReport;
  let outDir: string;
  beforeAll(async () => {
    outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'trellis-eval-'));
    report = await runEval({ outDir });
  }, 60_000);

  it('produces one block per budget with all 50 questions scored twice', () => {
    expect(report.budgets).toEqual([500, 1500, 3000]);
    expect(report.perBudget).toHaveLength(3);
    for (const b of report.perBudget) {
      expect(b.questions).toHaveLength(50);
      for (const q of b.questions) {
        for (const sys of [q.trellis, q.grep]) {
          expect(Array.isArray(sys.ids)).toBe(true);
          expect(sys.tokens).toBeGreaterThanOrEqual(0);
          if (sys.rank !== null) expect(sys.rank).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it('every answer respects the token budget — for both systems', () => {
    for (const b of report.perBudget) {
      for (const q of b.questions) {
        expect(q.trellis.tokens, `${b.budget}/${q.id}/trellis`).toBeLessThanOrEqual(b.budget);
        expect(q.grep.tokens, `${b.budget}/${q.id}/grep`).toBeLessThanOrEqual(b.budget);
      }
    }
  });

  it('metrics are rates in [0,1] and internally consistent', () => {
    for (const b of report.perBudget) {
      for (const sys of [b.trellis, b.grep]) {
        for (const v of [sys.hitRate, sys.mrr, sys.leakRate, ...Object.values(sys.hitRateByType)]) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
        const hits = b.questions.filter((q) => (sys === b.trellis ? q.trellis : q.grep).hit).length;
        expect(sys.hitRate).toBeCloseTo(hits / 50, 10);
      }
    }
  });

  it('emits a verdict line and writes both report files', async () => {
    expect(report.verdict.budget).toBe(1500);
    expect(report.verdict.line).toMatch(/^GATE (PASS|FAIL): trellis vs grep at 1500/);
    const json = JSON.parse(await fs.readFile(path.join(outDir, 'eval-report.json'), 'utf8'));
    expect(json.verdict.line).toBe(report.verdict.line);
    const md = await fs.readFile(path.join(outDir, 'eval-report.md'), 'utf8');
    expect(md).toContain(report.verdict.line);
    expect(md).toContain('## Where grep wins or ties');
  });
});
