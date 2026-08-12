export const NODE_TYPES = [
  'decision',
  'constraint',
  'component',
  'entity',
  'preference',
  'gotcha',
  'session',
] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export const EDGE_TYPES = [
  'supersedes',
  'contradicts',
  'depends_on',
  'implements',
  'observed_in',
  'relates_to',
] as const;
export type EdgeType = (typeof EDGE_TYPES)[number];

/** Folder each node type lives in, relative to the vault root. */
export const TYPE_FOLDER: Record<NodeType, string> = {
  decision: 'decisions',
  constraint: 'constraints',
  component: 'components',
  entity: 'entities',
  preference: 'preferences',
  gotcha: 'gotchas',
  session: 'sessions',
};

export interface Edge {
  rel: EdgeType;
  to: string; // target node id (wikilink slug)
}

export interface MemoryNode {
  id: string; // unique kebab-case slug; also the filename
  type: NodeType;
  title: string;
  summary: string; // one sentence; shown in skeleton results
  confidence: number; // 0..1
  tags: string[];
  created: string; // ISO 8601
  updated: string; // ISO 8601
  last_confirmed: string; // ISO 8601 — bumped when retrieval re-confirms the fact
  edges: Edge[];
  body: string; // markdown, may contain [[wikilinks]]; Relations section excluded
  path: string; // absolute file path on disk
}

export interface NodeInput {
  type: NodeType;
  title: string;
  summary: string;
  body?: string;
  tags?: string[];
  confidence?: number;
  edges?: Edge[];
}

export function isNodeType(v: unknown): v is NodeType {
  return typeof v === 'string' && (NODE_TYPES as readonly string[]).includes(v);
}

export function isEdgeType(v: unknown): v is EdgeType {
  return typeof v === 'string' && (EDGE_TYPES as readonly string[]).includes(v);
}
