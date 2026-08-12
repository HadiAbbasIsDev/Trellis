import YAML from 'yaml';
import {
  EDGE_TYPES,
  isEdgeType,
  isNodeType,
  type Edge,
  type MemoryNode,
} from './types';

/**
 * The Relations section is generated from frontmatter edges on every write so
 * Obsidian's graph view sees typed edges as real wikilinks. The HTML-comment
 * marker lets us strip and regenerate it without touching user prose.
 */
export const RELATIONS_MARKER = '<!-- trellis:relations -->';

export interface ParsedFile {
  node: MemoryNode;
  warnings: string[];
}

export function splitFrontmatter(
  raw: string,
): { data: Record<string, unknown>; body: string } | null {
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1); // Windows editors add a BOM
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(raw);
  if (!m) return null;
  let data: unknown;
  try {
    data = YAML.parse(m[1] ?? '');
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  return { data: data as Record<string, unknown>, body: raw.slice(m[0].length) };
}

/**
 * Remove only exact generated Relations blocks: the marker at line start,
 * the heading, and edge lines whose rel is one of the six REAL edge types
 * (a looser [a-z_]+ deleted user-authored bullets like "- see → [[x]]",
 * proven by review). Targets match to end-of-line so a ']' inside a target
 * can't leave generated lines behind to duplicate on every rewrite. Marker
 * text quoted in prose, and user content around the block, survive.
 */
const RELATIONS_BLOCK_RE = new RegExp(
  `(^|\\n)<!-- trellis:relations -->\\r?\\n## Relations\\r?\\n(?:- (?:${EDGE_TYPES.join('|')}) → \\[\\[[^\\n]+?\\]\\](?:\\r?\\n|$))*`,
  'g',
);

export function stripRelationsSection(body: string): string {
  return body.replace(RELATIONS_BLOCK_RE, '$1').replace(/\s+$/, '');
}

function asString(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

function asConfidence(v: unknown): number {
  const n = typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.8;
}

function asTags(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string') : [];
}

function asEdges(v: unknown, warnings: string[], file: string): Edge[] {
  if (!Array.isArray(v)) return [];
  const out: Edge[] = [];
  for (const e of v) {
    const rec = e as Record<string, unknown>;
    if (typeof e !== 'object' || e === null || !isEdgeType(rec.rel) || typeof rec.to !== 'string') {
      warnings.push(`${file}: dropped malformed edge ${JSON.stringify(e)}`);
      continue;
    }
    const to = rec.to;
    // A target is a node id: it must carry word characters and stay on one
    // line — a hand-authored newline target produced a Relations bullet the
    // strip regex can never match, growing the file on every write.
    if (/[\r\n]/.test(to) || !/[\p{L}\p{N}]/u.test(to)) {
      warnings.push(`${file}: dropped edge with malformed target ${JSON.stringify(to)}`);
      continue;
    }
    out.push({ rel: rec.rel as Edge['rel'], to });
  }
  return out;
}

/**
 * Parse one vault file. Returns null (no warning) for files that aren't
 * trellis notes at all (no frontmatter, or frontmatter without a `type`) —
 * READMEs and stray notes coexist peacefully. Returns null WITH a warning
 * when a file claims a type but it isn't a valid one.
 */
export function parseNodeFile(
  filePath: string,
  raw: string,
  fallbackDate: string,
  warnings: string[],
): MemoryNode | null {
  const clean = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const split = splitFrontmatter(clean);
  if (!split) {
    // A file that LOOKS like a note but won't parse must be loud: silent
    // nulls made hand-edited notes invisible AND left their filenames
    // clobberable by same-slug creates (proven data loss).
    if (/^---\r?\n/.test(clean)) {
      warnings.push(`${filePath}: unparseable frontmatter — note is invisible until fixed (file preserved)`);
    }
    return null;
  }
  const { data, body } = split;
  if (data.type === undefined) return null;
  if (!isNodeType(data.type)) {
    warnings.push(`${filePath}: unknown node type "${String(data.type)}" — skipped`);
    return null;
  }
  const base = filePath.replace(/\\/g, '/').split('/').pop()!.replace(/\.md$/i, '');
  const id = asString(data.id, base);
  const cleanBody = stripRelationsSection(body).trim();
  const extra = Object.fromEntries(
    Object.entries(data).filter(([k]) => !CANONICAL_KEYS.has(k)),
  );
  return {
    ...(Object.keys(extra).length > 0 ? { extra } : {}),
    id,
    type: data.type,
    title: asString(data.title, base),
    summary: asString(data.summary, ''),
    confidence: asConfidence(data.confidence),
    tags: asTags(data.tags),
    created: asString(data.created, fallbackDate),
    updated: asString(data.updated, fallbackDate),
    last_confirmed: asString(data.last_confirmed, asString(data.updated, fallbackDate)),
    edges: asEdges(data.edges, warnings, filePath),
    body: cleanBody,
    path: filePath,
  };
}

const CANONICAL_KEYS = new Set([
  'id', 'type', 'title', 'summary', 'confidence', 'tags',
  'created', 'updated', 'last_confirmed', 'edges',
]);

export function serializeNode(n: MemoryNode): string {
  const fm: Record<string, unknown> = {
    id: n.id,
    type: n.type,
    title: n.title,
    summary: n.summary,
    confidence: n.confidence,
    tags: n.tags,
    created: n.created,
    updated: n.updated,
    last_confirmed: n.last_confirmed,
    edges: n.edges.map((e) => ({ rel: e.rel, to: e.to })),
  };
  // user-authored keys ride along after ours; canonical keys always win
  for (const [k, v] of Object.entries(n.extra ?? {})) {
    if (!CANONICAL_KEYS.has(k)) fm[k] = v;
  }
  let out = `---\n${YAML.stringify(fm)}---\n\n`;
  const body = n.body.trim();
  if (body) out += `${body}\n`;
  if (n.edges.length > 0) {
    out += `\n${RELATIONS_MARKER}\n## Relations\n`;
    // defense in depth: whatever reaches us, the rendered bullet stays on one
    // line so the strip regex can always reclaim it
    out += n.edges.map((e) => `- ${e.rel} → [[${e.to.replace(/[\r\n]+/g, ' ')}]]`).join('\n') + '\n';
  }
  return out;
}

/** Unique [[wikilink]] targets in a body (aliases and heading refs stripped). */
export function extractWikilinks(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(/\[\[([^\]|#\n]+)(?:[|#][^\]]*)?\]\]/g)) {
    const target = (m[1] ?? '').trim();
    if (target) out.add(target);
  }
  return [...out];
}
