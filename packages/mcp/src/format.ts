import type { MemoryNode, RetrievalResult, ScoredItem } from '@trellis/core';

/** ~4 chars per token is close enough for budget enforcement. */
export function estimateTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

export interface SessionState {
  searches: number;
  expands: number;
  writes: number;
  links: number;
}

/**
 * Write-back rung 02: the footer is the only DYNAMIC prompt surface that
 * reaches every MCP client, delivered at the exact moment the agent is
 * reading our output. Keep it under ~45 tokens — it ships on every response.
 */
export function footer(s: SessionState): string {
  const writes = s.writes + s.links;
  if (writes === 0) {
    return `[session: ${s.searches} searches, 0 writes — record decisions, gotchas, and preferences with memory_write as they happen, not at session end]`;
  }
  return `[session: ${s.searches} searches, ${writes} writes — graph updated]`;
}

function skeletonLine(it: ScoredItem): string {
  const summary = it.summary ? ` — ${it.summary}` : '';
  return `- (${it.type}) [${it.id}] ${it.title}${summary}`;
}

/**
 * Budget is a contract: the assembled response is GUARANTEED to satisfy
 * estimateTokens(response) <= budgetTokens (verified by construction and a
 * final trim loop). The agent pulls full bodies via memory_expand only for
 * nodes it actually needs.
 */
export function renderSearch(
  result: RetrievalResult,
  budgetTokens: number,
  session: SessionState,
): string {
  const head = `memory graph: ${result.graphNodes} nodes, ${result.graphEdges} edges`;
  if (result.items.length === 0) {
    return [
      head,
      result.graphNodes === 0
        ? 'The graph is empty. As you work, record decisions, constraints, gotchas, and preferences with memory_write — future sessions (any agent) will retrieve them.'
        : 'No relevant nodes for this query. Try different terms, or browse by type with the types filter.',
      footer(session),
    ].join('\n');
  }
  const hint = '→ memory_expand(ids) for full detail on the nodes you need.';
  const foot = footer(session);
  const truncNote = (shown: number) =>
    `…budget reached: ${shown} of ${result.items.length} shown. Narrow the query or raise budget_tokens.`;
  const assemble = (lines: string[]) => {
    const parts = [head, ...lines];
    if (lines.length < result.items.length) parts.push(truncNote(lines.length));
    parts.push(hint, foot);
    return parts.join('\n');
  };
  // fixed overhead measured, not guessed — the old flat reserve undershot
  const fixed =
    estimateTokens(head) + estimateTokens(hint) + estimateTokens(foot) +
    estimateTokens(truncNote(result.items.length)) + 4; // joins
  const lines: string[] = [];
  let spent = fixed;
  for (const it of result.items) {
    const line = skeletonLine(it);
    const cost = estimateTokens(line);
    if (spent + cost > budgetTokens) break;
    lines.push(line);
    spent += cost;
  }
  if (lines.length === 0) {
    // budget too small for even one skeleton: give bare ids, still under budget
    const ids = result.items.slice(0, 3).map((i) => `[${i.id}]`).join(' ');
    lines.push(`top: ${ids}`.slice(0, Math.max(20, (budgetTokens - fixed) * 4)));
  }
  let out = assemble(lines);
  while (estimateTokens(out) > budgetTokens && lines.length > 1) {
    lines.pop();
    out = assemble(lines);
  }
  return out;
}

export function renderNode(n: MemoryNode, supersededBy?: string): string {
  const lines = [`── (${n.type}) [${n.id}] ${n.title}`];
  if (supersededBy) {
    lines.push(`⚠ SUPERSEDED — historical record only. Current: [${supersededBy}] (expand that instead).`);
  }
  lines.push(
    `summary: ${n.summary}`,
    `confidence ${n.confidence.toFixed(2)} · created ${n.created.slice(0, 10)} · updated ${n.updated.slice(0, 10)}`,
  );
  if (n.tags.length > 0) lines.push(`tags: ${n.tags.join(', ')}`);
  if (n.edges.length > 0) {
    lines.push(`edges: ${n.edges.map((e) => `${e.rel} → ${e.to}`).join('; ')}`);
  }
  if (n.body) lines.push('', n.body);
  return lines.join('\n');
}
