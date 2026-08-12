/**
 * Phase 1 gate: does budgeted graph retrieval beat a grep baseline on the
 * benchmark vault? Runs 50 questions against both systems at three token
 * budgets and writes eval-report.{json,md}.
 *
 * Honesty rules baked in:
 * - Both systems are scored ONLY on what fits inside the same token budget
 *   (~4 chars/token, same estimate the MCP formatter uses).
 * - Trellis pays the same fixed framing overhead the real server response
 *   carries (header, hint, footer) — not just the skeleton lines.
 * - The grep baseline gets the agent-favorable version: query terms come from
 *   the same tokenizer (so camelCase splitting helps it too) and matching is
 *   case-insensitive substring over the RAW files, frontmatter included.
 * - Per-category tables are always reported; if grep wins a category the
 *   report names it in a dedicated section.
 *
 * Usage: npx tsx packages/eval/src/run.ts
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  buildIndex,
  buildSupersededBy,
  countEdges,
  loadVault,
  retrieve,
  tokenize,
  type LoadedVault,
} from '../../core/src/index';

const PKG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Frozen so recency decay cannot drift the numbers between runs; the bench
// vault's newest node is 2026-07-10, so this sits just after the data.
const FIXED_NOW = Date.parse('2026-08-12T00:00:00.000Z');

export const QUESTION_TYPES = ['lookup', 'multi-hop', 'superseded', 'negative'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export interface Question {
  id: string;
  query: string;
  expect: string[];
  type: QuestionType;
}

export interface SystemAnswer {
  ids: string[]; // what actually fit inside the budget, in rank order
  tokens: number; // estimated tokens the answer consumed
  hit: boolean;
  rank: number | null; // 1-based rank of the first expected id, null if absent
  leaked: string[]; // superseded node ids that appeared in the answer
}

export interface QuestionResult {
  id: string;
  type: QuestionType;
  query: string;
  expect: string[];
  trellis: SystemAnswer;
  grep: SystemAnswer;
}

export interface SystemMetrics {
  hitRate: number;
  hitRateByType: Record<QuestionType, number>;
  mrr: number; // over non-negative questions
  meanTokens: number;
  leakRate: number; // over superseded questions
}

export interface BudgetReport {
  budget: number;
  trellis: SystemMetrics;
  grep: SystemMetrics;
  questions: QuestionResult[];
}

export interface EvalReport {
  generatedAt: string;
  now: string;
  vault: { dir: string; nodes: number; edges: number; superseded: number };
  budgets: number[];
  questionCounts: Record<QuestionType, number>;
  perBudget: BudgetReport[];
  grepWins: string[]; // "budget/category" cells where grep beat trellis
  verdict: { budget: number; pass: boolean; line: string };
}

/** Same ~4 chars/token estimate as packages/mcp/src/format.ts. Kept local:
 * eval owns only packages/eval and @trellis/mcp is not path-aliased. */
export function estimateTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

/** Mirror of the MCP skeleton line so token costs match what clients see. */
function skeletonLine(it: { type: string; id: string; title: string; summary: string }): string {
  const summary = it.summary ? ` — ${it.summary}` : '';
  return `- (${it.type}) [${it.id}] ${it.title}${summary}`;
}

/** Query terms for the grep baseline: tokenizer-split (camelCase help
 * included), length >= 3 so two-letter fragments don't match everything. */
export function grepTerms(query: string): string[] {
  return [...new Set(tokenize(query))].filter((t) => t.length >= 3);
}

interface RawFile {
  id: string;
  tokens: number; // whole-file cost: grep hands the agent full files
  lower: string; // lowercased raw content, frontmatter included
}

function countOccurrences(haystack: string, needle: string): number {
  let n = 0;
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + needle.length)) {
    n++;
  }
  return n;
}

/**
 * The baseline an honest skeptic would demand: rank files by total term
 * occurrences, then read them in rank order until the budget runs out —
 * exactly what an agent doing `grep -ric` + `cat` would consume.
 */
function grepAnswer(files: RawFile[], query: string, budget: number): { ids: string[]; tokens: number } {
  const terms = grepTerms(query);
  const matched = files
    .map((f) => ({
      f,
      count: terms.reduce((acc, t) => acc + countOccurrences(f.lower, t), 0),
    }))
    .filter((m) => m.count > 0)
    // deterministic order: strongest match first, path as tiebreak
    .sort((a, b) => b.count - a.count || a.f.id.localeCompare(b.f.id));
  const ids: string[] = [];
  let spent = 0;
  for (const m of matched) {
    if (spent + m.f.tokens > budget) break; // reading in rank order stops here
    ids.push(m.f.id);
    spent += m.f.tokens;
  }
  return { ids, tokens: spent };
}

/**
 * Trellis under budget: retrieve, then charge the response the same way
 * renderSearch does — fixed framing first, then skeleton lines in rank order
 * until the budget is spent.
 */
function trellisAnswer(
  vault: LoadedVault,
  index: ReturnType<typeof buildIndex>,
  query: string,
  budget: number,
): { ids: string[]; tokens: number } {
  const res = retrieve(vault, index, query, { now: FIXED_NOW });
  // Framing mirrored from packages/mcp/src/format.ts: header + expand hint +
  // session footer + truncation note. Charged against trellis, not grep.
  const framing =
    estimateTokens(`memory graph: ${res.graphNodes} nodes, ${res.graphEdges} edges`) +
    estimateTokens('→ memory_expand(ids) for full detail on the nodes you need.') +
    estimateTokens('[session: 1 searches, 0 writes — record decisions, gotchas, and preferences with memory_write as they happen, not at session end]') +
    estimateTokens(`…budget reached: ${res.items.length} of ${res.items.length} shown. Narrow the query or raise budget_tokens.`) +
    4;
  const ids: string[] = [];
  // The real server's EMPTY response still costs ~65 tokens (header + "no
  // relevant nodes" + footer) — measured; charging 0 flattered mean tokens.
  let spent = res.items.length > 0 ? framing : 65;
  for (const it of res.items) {
    const cost = estimateTokens(skeletonLine(it));
    if (spent + cost > budget) break;
    ids.push(it.id);
    spent += cost;
  }
  return { ids, tokens: spent };
}

function scoreAnswer(
  q: Question,
  ids: string[],
  tokens: number,
  superseded: ReadonlySet<string>,
): SystemAnswer {
  const leaked = ids.filter((id) => superseded.has(id));
  if (q.type === 'negative') {
    // "nothing relevant exists" — success is returning nothing at all
    return { ids, tokens, hit: ids.length === 0, rank: null, leaked };
  }
  let rank: number | null = null;
  for (let i = 0; i < ids.length; i++) {
    if (q.expect.includes(ids[i]!)) {
      rank = i + 1;
      break;
    }
  }
  return { ids, tokens, hit: rank !== null, rank, leaked };
}

function metrics(results: QuestionResult[], pick: (r: QuestionResult) => SystemAnswer): SystemMetrics {
  const byType: Record<QuestionType, number> = { lookup: 0, 'multi-hop': 0, superseded: 0, negative: 0 };
  const totalByType: Record<QuestionType, number> = { ...byType };
  let hits = 0;
  let rrSum = 0;
  let rrN = 0;
  let tokens = 0;
  let leaks = 0;
  let supersededN = 0;
  for (const r of results) {
    const a = pick(r);
    totalByType[r.type]++;
    if (a.hit) {
      hits++;
      byType[r.type]++;
    }
    if (r.type !== 'negative') {
      rrSum += a.rank !== null ? 1 / a.rank : 0;
      rrN++;
    }
    if (r.type === 'superseded') {
      supersededN++;
      if (a.leaked.length > 0) leaks++;
    }
    tokens += a.tokens;
  }
  const rate = (n: number, d: number) => (d > 0 ? n / d : 0);
  return {
    hitRate: rate(hits, results.length),
    hitRateByType: {
      lookup: rate(byType.lookup, totalByType.lookup),
      'multi-hop': rate(byType['multi-hop'], totalByType['multi-hop']),
      superseded: rate(byType.superseded, totalByType.superseded),
      negative: rate(byType.negative, totalByType.negative),
    },
    mrr: rate(rrSum, rrN),
    meanTokens: rate(tokens, results.length),
    leakRate: rate(leaks, supersededN),
  };
}

export interface RunOptions {
  vaultDir?: string;
  questionsPath?: string;
  budgets?: number[];
  outDir?: string; // where the two report files land; undefined = don't write
}

export async function runEval(opts: RunOptions = {}): Promise<EvalReport> {
  const vaultDir = opts.vaultDir ?? path.join(PKG_DIR, 'bench-vault');
  const questionsPath = opts.questionsPath ?? path.join(PKG_DIR, 'questions.json');
  const budgets = opts.budgets ?? [500, 1500, 3000];

  const questions: Question[] = JSON.parse(await fs.readFile(questionsPath, 'utf8'));
  const vault = await loadVault(vaultDir);
  if (vault.nodes.size === 0) {
    throw new Error(`bench vault is empty at ${vaultDir} — run: npx tsx packages/eval/src/gen.ts`);
  }
  const index = buildIndex(vault);
  const superseded = new Set(buildSupersededBy(vault).keys());

  // grep reads the committed files exactly as they are on disk
  const files: RawFile[] = [];
  for (const n of vault.nodes.values()) {
    const raw = await fs.readFile(n.path, 'utf8');
    files.push({ id: n.id, tokens: estimateTokens(raw), lower: raw.toLowerCase() });
  }
  files.sort((a, b) => a.id.localeCompare(b.id));

  const perBudget: BudgetReport[] = [];
  for (const budget of budgets) {
    const results: QuestionResult[] = questions.map((q) => {
      const t = trellisAnswer(vault, index, q.query, budget);
      const g = grepAnswer(files, q.query, budget);
      return {
        id: q.id,
        type: q.type,
        query: q.query,
        expect: q.expect,
        trellis: scoreAnswer(q, t.ids, t.tokens, superseded),
        grep: scoreAnswer(q, g.ids, g.tokens, superseded),
      };
    });
    perBudget.push({
      budget,
      trellis: metrics(results, (r) => r.trellis),
      grep: metrics(results, (r) => r.grep),
      questions: results,
    });
  }

  // Name every cell grep wins — the report must say so, not bury it.
  const grepWins: string[] = [];
  for (const b of perBudget) {
    for (const t of QUESTION_TYPES) {
      if (b.grep.hitRateByType[t] > b.trellis.hitRateByType[t]) {
        grepWins.push(`${b.budget}/${t}`);
      }
    }
    if (b.grep.hitRate > b.trellis.hitRate) grepWins.push(`${b.budget}/overall`);
  }

  const gate = perBudget.find((b) => b.budget === 1500) ?? perBudget[0]!;
  const pass = gate.trellis.hitRate > gate.grep.hitRate && gate.trellis.leakRate <= gate.grep.leakRate;
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const line =
    `GATE ${pass ? 'PASS' : 'FAIL'}: trellis vs grep at ${gate.budget} — ` +
    `hit ${pct(gate.trellis.hitRate)} vs ${pct(gate.grep.hitRate)}, ` +
    `MRR ${gate.trellis.mrr.toFixed(3)} vs ${gate.grep.mrr.toFixed(3)}, ` +
    `superseded leak ${pct(gate.trellis.leakRate)} vs ${pct(gate.grep.leakRate)}, ` +
    `mean tokens ${Math.round(gate.trellis.meanTokens)} vs ${Math.round(gate.grep.meanTokens)}`;

  const counts: Record<QuestionType, number> = { lookup: 0, 'multi-hop': 0, superseded: 0, negative: 0 };
  for (const q of questions) counts[q.type]++;

  const report: EvalReport = {
    generatedAt: new Date().toISOString(),
    now: new Date(FIXED_NOW).toISOString(),
    vault: {
      dir: vaultDir,
      nodes: vault.nodes.size,
      edges: countEdges(vault),
      superseded: superseded.size,
    },
    budgets,
    questionCounts: counts,
    perBudget,
    grepWins,
    verdict: { budget: gate.budget, pass, line },
  };

  if (opts.outDir !== undefined) {
    await fs.mkdir(opts.outDir, { recursive: true });
    await fs.writeFile(path.join(opts.outDir, 'eval-report.json'), JSON.stringify(report, null, 2) + '\n');
    await fs.writeFile(path.join(opts.outDir, 'eval-report.md'), renderMarkdown(report));
  }
  return report;
}

function renderMarkdown(r: EvalReport): string {
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const lines: string[] = [];
  lines.push('# Trellis eval report — budgeted retrieval vs grep baseline');
  lines.push('');
  lines.push(`> **${r.verdict.line}**`);
  lines.push('');
  lines.push(
    `Benchmark vault: ${r.vault.nodes} nodes, ${r.vault.edges} edges, ` +
      `${r.vault.superseded} superseded. Questions: ${Object.entries(r.questionCounts)
        .map(([t, n]) => `${n} ${t}`)
        .join(', ')}. Scoring clock frozen at ${r.now.slice(0, 10)}.`,
  );
  lines.push('');
  lines.push('## Summary per budget');
  lines.push('');
  lines.push('| budget | system | hit-rate | MRR | mean tokens | superseded leak |');
  lines.push('|---|---|---|---|---|---|');
  for (const b of r.perBudget) {
    lines.push(
      `| ${b.budget} | trellis | ${pct(b.trellis.hitRate)} | ${b.trellis.mrr.toFixed(3)} | ${Math.round(b.trellis.meanTokens)} | ${pct(b.trellis.leakRate)} |`,
    );
    lines.push(
      `| ${b.budget} | grep | ${pct(b.grep.hitRate)} | ${b.grep.mrr.toFixed(3)} | ${Math.round(b.grep.meanTokens)} | ${pct(b.grep.leakRate)} |`,
    );
  }
  lines.push('');
  lines.push('## Hit-rate by question type');
  lines.push('');
  lines.push('| budget | system | lookup | multi-hop | superseded | negative |');
  lines.push('|---|---|---|---|---|---|');
  for (const b of r.perBudget) {
    for (const sys of ['trellis', 'grep'] as const) {
      const m = b[sys];
      lines.push(
        `| ${b.budget} | ${sys} | ${pct(m.hitRateByType.lookup)} | ${pct(m.hitRateByType['multi-hop'])} | ${pct(m.hitRateByType.superseded)} | ${pct(m.hitRateByType.negative)} |`,
      );
    }
  }
  lines.push('');
  lines.push('## Where grep wins or ties');
  lines.push('');
  if (r.grepWins.length > 0) {
    lines.push('Cells where the grep baseline BEAT trellis (budget/category):');
    for (const w of r.grepWins) lines.push(`- ${w}`);
  } else {
    lines.push('No budget/category cell where grep beat trellis outright.');
  }
  const gate = r.perBudget.find((b) => b.budget === r.verdict.budget)!;
  const ties = QUESTION_TYPES.filter(
    (t) => gate.grep.hitRateByType[t] === gate.trellis.hitRateByType[t],
  );
  if (ties.length > 0) {
    lines.push(`Ties at ${gate.budget}: ${ties.join(', ')}.`);
  }
  lines.push('');
  lines.push('## Misses at the gate budget');
  lines.push('');
  const misses = gate.questions.filter((q) => !q.trellis.hit);
  if (misses.length === 0) {
    lines.push('Trellis answered every question at this budget.');
  } else {
    lines.push('Questions trellis got wrong (full list — no cherry-picking):');
    for (const m of misses) {
      lines.push(`- ${m.id} (${m.type}) "${m.query}" → expected [${m.expect.join(', ')}], got [${m.trellis.ids.slice(0, 5).join(', ')}${m.trellis.ids.length > 5 ? ', …' : ''}]`);
    }
  }
  lines.push('');
  lines.push('## Method');
  lines.push('');
  lines.push('- Both systems consume the SAME token budget (~4 chars/token).');
  lines.push('- Trellis: BM25 seeds → 2-hop graph expansion → skeleton lines in rank order, plus the fixed response framing the real MCP server sends.');
  lines.push('- Grep: query terms from the same tokenizer, case-insensitive substring match over the raw .md files (frontmatter included); files ranked by total occurrences and read whole, in rank order, until the budget is exhausted.');
  lines.push('- Hit = any expected id inside the budget. Negative questions count as hit only when the answer is empty.');
  lines.push('- MRR over non-negative questions; leak rate = superseded questions whose answer contains a superseded node.');
  lines.push('- N05 deliberately reuses a word that appears in the vault ("queries"), so both systems are exposed to false-positive noise on negatives.');
  lines.push('');
  lines.push('## Caveats (from independent adversarial audit)');
  lines.push('');
  lines.push('- The superseded-category "leak 0% vs 100%" gap is definitional, not empirical: a text-match baseline has no supersession model, so it fails by construction. The empirical claims are the hit-rate, multi-hop, and token numbers.');
  lines.push('- On a 5-question unseen holdout, trellis held its hit-rate margin (5/5 vs 3/5) but its MRR fell to parity — the committed question set flatters trellis ranking quality, not its coverage. Treat MRR here as an upper bound.');
  lines.push('- Two independently built fairer grep variants (skeleton-cost accounting, density ranking) did not change the verdict; whole-file accounting understates grep by ~6 points only at the 500 budget.');
  lines.push('');
  return lines.join('\n');
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  runEval({ outDir: PKG_DIR })
    .then((report) => {
      console.log(report.verdict.line);
      for (const b of report.perBudget) {
        console.log(
          `  @${b.budget}: trellis hit ${(b.trellis.hitRate * 100).toFixed(1)}% ` +
            `(MRR ${b.trellis.mrr.toFixed(3)}, ~${Math.round(b.trellis.meanTokens)} tok) | ` +
            `grep hit ${(b.grep.hitRate * 100).toFixed(1)}% ` +
            `(MRR ${b.grep.mrr.toFixed(3)}, ~${Math.round(b.grep.meanTokens)} tok)`,
        );
      }
      console.log(`reports → ${path.join(PKG_DIR, 'eval-report.{json,md}')}`);
      process.exitCode = report.verdict.pass ? 0 : 1;
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
