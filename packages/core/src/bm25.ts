import { tokenize } from './tokenize';

export interface Bm25Doc {
  id: string;
  fields: Record<string, string>;
}

interface FieldIndex {
  df: Map<string, number>; // term -> docs containing it
  tf: Map<string, Map<string, number>>; // docId -> term -> count
  len: Map<string, number>; // docId -> token count
  avg: number;
}

/**
 * Fielded BM25 (BM25F-lite): score each field independently, sum weighted.
 * Pure TS on purpose — no SQLite, no WASM, no native prebuilds. At vault
 * scale (thousands of notes) a full rebuild is effectively instant.
 */
export class Bm25Index {
  private readonly n: number;
  private readonly idx = new Map<string, FieldIndex>();

  constructor(
    docs: Bm25Doc[],
    private readonly weights: Record<string, number>,
    private readonly k1 = 1.2,
    private readonly b = 0.75,
  ) {
    this.n = docs.length;
    for (const fname of Object.keys(weights)) {
      const df = new Map<string, number>();
      const tf = new Map<string, Map<string, number>>();
      const len = new Map<string, number>();
      let total = 0;
      for (const d of docs) {
        const toks = tokenize(d.fields[fname] ?? '');
        len.set(d.id, toks.length);
        total += toks.length;
        const counts = new Map<string, number>();
        for (const t of toks) counts.set(t, (counts.get(t) ?? 0) + 1);
        tf.set(d.id, counts);
        for (const t of counts.keys()) df.set(t, (df.get(t) ?? 0) + 1);
      }
      this.idx.set(fname, { df, tf, len, avg: this.n > 0 ? total / this.n || 1 : 1 });
    }
  }

  search(query: string, limit = 10): { id: string; score: number }[] {
    const qTerms = [...new Set(tokenize(query))];
    if (qTerms.length === 0) return [];
    const scores = new Map<string, number>();
    for (const [fname, weight] of Object.entries(this.weights)) {
      const f = this.idx.get(fname);
      if (!f) continue;
      for (const [docId, counts] of f.tf) {
        let s = 0;
        const dl = f.len.get(docId) ?? 0;
        for (const t of qTerms) {
          const tfv = counts.get(t);
          if (!tfv) continue;
          const df = f.df.get(t) ?? 0;
          const idf = Math.log(1 + (this.n - df + 0.5) / (df + 0.5));
          s += (idf * (tfv * (this.k1 + 1))) /
            (tfv + this.k1 * (1 - this.b + this.b * (dl / f.avg)));
        }
        if (s > 0) scores.set(docId, (scores.get(docId) ?? 0) + weight * s);
      }
    }
    return [...scores.entries()]
      .map(([id, score]) => ({ id, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
