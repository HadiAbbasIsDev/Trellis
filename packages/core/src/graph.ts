import { resolveNode, type LoadedVault } from './vault';

function freshness(vault: LoadedVault, id: string): number {
  const t = Date.parse(vault.nodes.get(id)?.updated ?? '');
  return Number.isFinite(t) ? t : -Infinity;
}

/**
 * target -> superseder, with two guarantees the raw edges don't give:
 * - one superseder per target (newest `updated` wins, id as tiebreak), and
 * - NO cycles: within each supersedes cycle the newest member is crowned
 *   current and every other member maps to it. Without this, a mutual
 *   supersedes (trivially creatable by two concurrent agents) black-holes
 *   every node whose chain touches the cycle.
 */
export function buildSupersededBy(vault: LoadedVault): Map<string, string> {
  const candidates = new Map<string, string[]>();
  for (const n of vault.nodes.values()) {
    for (const e of n.edges) {
      if (e.rel !== 'supersedes') continue;
      const target = resolveNode(vault, e.to);
      if (!target || target.id === n.id) continue;
      const list = candidates.get(target.id) ?? [];
      list.push(n.id);
      candidates.set(target.id, list);
    }
  }
  const newestFirst = (a: string, b: string) =>
    freshness(vault, b) - freshness(vault, a) || a.localeCompare(b);
  const map = new Map<string, string>();
  for (const [target, list] of candidates) {
    map.set(target, [...list].sort(newestFirst)[0]!);
  }
  // break cycles deterministically
  for (const start of [...map.keys()]) {
    const path: string[] = [];
    const seen = new Set<string>();
    let cur: string | undefined = start;
    while (cur !== undefined && map.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      path.push(cur);
      cur = map.get(cur);
    }
    if (cur !== undefined && seen.has(cur)) {
      const cycle = path.slice(path.indexOf(cur));
      const winner = [...cycle].sort(newestFirst)[0]!;
      map.delete(winner); // the winner is current
      for (const member of cycle) if (member !== winner) map.set(member, winner);
    }
  }
  return map;
}

/** Follow a supersedes chain to the current node. Safe on any map. */
export function chainCurrent(map: Map<string, string>, id: string): string {
  const seen = new Set<string>();
  let cur = id;
  while (map.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    cur = map.get(cur)!;
  }
  return cur;
}

/** The node that (transitively) supersedes `id`, or undefined if current. */
export function findSuperseder(
  vault: LoadedVault,
  id: string,
  map: Map<string, string> = buildSupersededBy(vault),
): string | undefined {
  const cur = chainCurrent(map, id);
  return cur !== id ? cur : undefined;
}

/**
 * Would adding `from supersedes to` close a loop? True when `from` is
 * reachable from `to` along existing supersedes edges. Checked at the tool
 * boundary so cycles are refused instead of repaired after the fact.
 */
export function supersedesWouldCycle(vault: LoadedVault, from: string, to: string): boolean {
  if (from === to) return true;
  const seen = new Set<string>();
  let frontier = [to];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      if (id === from) return true;
      if (seen.has(id)) continue;
      seen.add(id);
      const n = vault.nodes.get(id);
      if (!n) continue;
      for (const e of n.edges) {
        if (e.rel !== 'supersedes') continue;
        const t = resolveNode(vault, e.to);
        if (t) next.push(t.id);
      }
    }
    frontier = next;
  }
  return false;
}
