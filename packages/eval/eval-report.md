# Trellis eval report — budgeted retrieval vs grep baseline

> **GATE PASS: trellis vs grep at 1500 — hit 96.0% vs 80.0%, MRR 0.773 vs 0.694, superseded leak 0.0% vs 100.0%, mean tokens 544 vs 836**

Benchmark vault: 64 nodes, 47 edges, 4 superseded. Questions: 30 lookup, 9 multi-hop, 6 superseded, 5 negative. Scoring clock frozen at 2026-08-12.

## Summary per budget

| budget | system | hit-rate | MRR | mean tokens | superseded leak |
|---|---|---|---|---|---|
| 500 | trellis | 96.0% | 0.773 | 400 | 0.0% |
| 500 | grep | 74.0% | 0.678 | 352 | 100.0% |
| 1500 | trellis | 96.0% | 0.773 | 544 | 0.0% |
| 1500 | grep | 80.0% | 0.694 | 836 | 100.0% |
| 3000 | trellis | 96.0% | 0.773 | 544 | 0.0% |
| 3000 | grep | 80.0% | 0.694 | 1059 | 100.0% |

## Hit-rate by question type

| budget | system | lookup | multi-hop | superseded | negative |
|---|---|---|---|---|---|
| 500 | trellis | 96.7% | 100.0% | 100.0% | 80.0% |
| 500 | grep | 93.3% | 0.0% | 83.3% | 80.0% |
| 1500 | trellis | 96.7% | 100.0% | 100.0% | 80.0% |
| 1500 | grep | 100.0% | 0.0% | 100.0% | 80.0% |
| 3000 | trellis | 96.7% | 100.0% | 100.0% | 80.0% |
| 3000 | grep | 100.0% | 0.0% | 100.0% | 80.0% |

## Where grep wins or ties

Cells where the grep baseline BEAT trellis (budget/category):
- 1500/lookup
- 3000/lookup
Ties at 1500: superseded, negative.

## Misses at the gate budget

Questions trellis got wrong (full list — no cherry-picking):
- L14 (lookup) "commit message format convention" → expected [conventional-commits-with-scope], got [payroll-export, soc2-audit-trail-for-admin-actions, read-replica-for-reporting-queries, reporting-pipeline]
- N05 (negative) "graphql resolver nested queries" → expected [], got [read-replica-for-reporting-queries, pgbouncer-transaction-mode-breaks-prepared-statements, normalize-schedule-tables-drop-jsonb, postgres-primary-cluster, reporting-pipeline, …]

## Method

- Both systems consume the SAME token budget (~4 chars/token).
- Trellis: BM25 seeds → 2-hop graph expansion → skeleton lines in rank order, plus the fixed response framing the real MCP server sends.
- Grep: query terms from the same tokenizer, case-insensitive substring match over the raw .md files (frontmatter included); files ranked by total occurrences and read whole, in rank order, until the budget is exhausted.
- Hit = any expected id inside the budget. Negative questions count as hit only when the answer is empty.
- MRR over non-negative questions; leak rate = superseded questions whose answer contains a superseded node.
- N05 deliberately reuses a word that appears in the vault ("queries"), so both systems are exposed to false-positive noise on negatives.

## Caveats (from independent adversarial audit)

- The superseded-category "leak 0% vs 100%" gap is definitional, not empirical: a text-match baseline has no supersession model, so it fails by construction. The empirical claims are the hit-rate, multi-hop, and token numbers.
- On a 5-question unseen holdout, trellis held its hit-rate margin (5/5 vs 3/5) but its MRR fell to parity — the committed question set flatters trellis ranking quality, not its coverage. Treat MRR here as an upper bound.
- Two independently built fairer grep variants (skeleton-cost accounting, density ranking) did not change the verdict; whole-file accounting understates grep by ~6 points only at the 500 budget.
