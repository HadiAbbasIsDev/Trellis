import { buildSupersededBy } from './graph';
import { tokenize } from './tokenize';
import type { LoadedVault } from './vault';
import type { NodeType } from './types';

export interface DuplicateCandidate {
  id: string;
  title: string;
  similarity: number; // Jaccard over title+summary tokens, 0..1
}

/**
 * Cheap near-duplicate check run on every write. Without this the graph
 * doubles every few sessions as agents restate known facts — dedup is a
 * day-one concern, not a polish item.
 */
export function findNearDuplicates(
  vault: LoadedVault,
  type: NodeType,
  title: string,
  summary: string,
  threshold = 0.5,
  limit = 3,
): DuplicateCandidate[] {
  const a = new Set(tokenize(`${title} ${summary}`));
  if (a.size === 0) return [];
  const superseded = buildSupersededBy(vault);
  const out: DuplicateCandidate[] = [];
  for (const n of vault.nodes.values()) {
    if (n.type !== type) continue;
    if (superseded.has(n.id)) continue; // hidden nodes shouldn't be named as dupes
    const b = new Set(tokenize(`${n.title} ${n.summary}`));
    if (b.size === 0) continue;
    let inter = 0;
    for (const t of a) if (b.has(t)) inter++;
    const union = a.size + b.size - inter;
    const sim = union > 0 ? inter / union : 0;
    if (sim >= threshold) out.push({ id: n.id, title: n.title, similarity: sim });
  }
  return out.sort((x, y) => y.similarity - x.similarity).slice(0, limit);
}
