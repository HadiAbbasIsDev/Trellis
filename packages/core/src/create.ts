import { slugify } from './slug';
import type { LoadedVault } from './vault';
import { nextId, resolveNode } from './vault';
import type { Edge, MemoryNode, NodeInput } from './types';

export interface EdgeResolution {
  edges: Edge[];
  unresolved: string[]; // forward-ref targets, stored in slug form
  dropped: string[]; // targets with no word characters — unresolvable forever
}

export function resolveEdges(vault: LoadedVault, edges: Edge[] | undefined): EdgeResolution {
  const out: Edge[] = [];
  const unresolved: string[] = [];
  const dropped: string[] = [];
  for (const e of edges ?? []) {
    const target = resolveNode(vault, e.to);
    if (target) {
      out.push({ rel: e.rel, to: target.id });
    } else if (!/[\p{L}\p{N}]/u.test(e.to)) {
      dropped.push(e.to); // '???' would slug to the 'note' placeholder
    } else {
      // Forward references are stored slugified: that is the id the target
      // will get when created by title, so the link self-heals — and slugs
      // can't smuggle ']' into the generated Relations block.
      const slug = slugify(e.to);
      out.push({ rel: e.rel, to: slug });
      unresolved.push(slug);
    }
  }
  return { edges: out, unresolved, dropped };
}

export function createNode(vault: LoadedVault, input: NodeInput, now: string): MemoryNode {
  return {
    id: nextId(vault, input.title),
    type: input.type,
    title: input.title.trim(),
    summary: input.summary.trim(),
    confidence: input.confidence ?? 0.8,
    tags: input.tags ?? [],
    created: now,
    updated: now,
    last_confirmed: now,
    edges: input.edges ?? [],
    body: (input.body ?? '').trim(),
    path: '',
  };
}

export interface NodePatch {
  title?: string;
  summary?: string;
  body?: string;
  tags?: string[];
  confidence?: number;
  edges?: Edge[]; // merged into existing, deduped by rel+to
}

export function updateNode(node: MemoryNode, patch: NodePatch, now: string): MemoryNode {
  const mergedEdges = [...node.edges];
  for (const e of patch.edges ?? []) {
    if (!mergedEdges.some((m) => m.rel === e.rel && m.to === e.to)) mergedEdges.push(e);
  }
  return {
    ...node,
    title: patch.title?.trim() || node.title,
    summary: patch.summary?.trim() || node.summary,
    body: patch.body !== undefined ? patch.body.trim() : node.body,
    tags: patch.tags ?? node.tags,
    confidence: patch.confidence ?? node.confidence,
    edges: mergedEdges,
    updated: now,
    last_confirmed: now,
  };
}
