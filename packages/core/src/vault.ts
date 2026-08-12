import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parseNodeFile, serializeNode } from './frontmatter';
import { slugify } from './slug';
import { TYPE_FOLDER, type MemoryNode } from './types';

export interface LoadedVault {
  dir: string;
  nodes: Map<string, MemoryNode>; // keyed by id
  warnings: string[];
  /**
   * Lowercased basenames (sans .md) of EVERY markdown file seen, parsed or
   * not. Reserved-filename set: a note with broken YAML is invisible to the
   * graph but its filename must never be clobbered by a same-slug create.
   * Optional so in-memory vaults (tests) can omit it.
   */
  files?: Set<string>;
}

/**
 * Load every trellis note under the vault dir. Small vaults reload fully on
 * each tool call — that keeps concurrent writers (Claude + Codex on the same
 * project) consistent. Incremental indexing is a Phase 1 concern.
 */
export async function loadVault(dir: string): Promise<LoadedVault> {
  const vault: LoadedVault = { dir, nodes: new Map(), warnings: [], files: new Set() };
  let entries: string[];
  try {
    entries = (await fs.readdir(dir, { recursive: true })) as string[];
  } catch {
    return vault; // vault doesn't exist yet — empty graph, created on first write
  }
  for (const rel of entries) {
    const relNorm = rel.replace(/\\/g, '/');
    if (!relNorm.toLowerCase().endsWith('.md')) continue;
    if (relNorm.split('/').some((seg) => seg.startsWith('.'))) continue; // .obsidian, .lock…
    const full = path.join(dir, rel);
    const base = relNorm.split('/').pop()!.replace(/\.md$/i, '');
    vault.files!.add(base.toLowerCase());
    let raw: string;
    let mtime: Date;
    try {
      const [content, stat] = await Promise.all([fs.readFile(full, 'utf8'), fs.stat(full)]);
      raw = content;
      mtime = stat.mtime;
    } catch {
      continue; // raced with a writer; next reload catches it
    }
    const node = parseNodeFile(full, raw, mtime.toISOString(), vault.warnings);
    if (!node) continue;
    const existing = vault.nodes.get(node.id);
    if (existing) {
      // Deterministic winner: newest `updated` (readdir order is not stable),
      // path as tiebreak. The loser is warned about, never deleted.
      const tNew = Date.parse(node.updated);
      const tOld = Date.parse(existing.updated);
      const a = Number.isFinite(tNew) ? tNew : -Infinity;
      const b = Number.isFinite(tOld) ? tOld : -Infinity;
      const keepNew = a > b || (a === b && node.path < existing.path);
      const kept = keepNew ? node : existing;
      const dropped = keepNew ? existing : node;
      vault.warnings.push(
        `duplicate id "${node.id}": keeping ${kept.path}, ignoring ${dropped.path}`,
      );
      if (keepNew) vault.nodes.set(node.id, node);
      continue;
    }
    vault.nodes.set(node.id, node);
  }
  return vault;
}

/** Resolve a wikilink-ish reference to a node: exact id, case-insensitive, or slugified. */
export function resolveNode(vault: LoadedVault, ref: string): MemoryNode | undefined {
  if (!/[\p{L}\p{N}]/u.test(ref)) return undefined; // '???' must not hit the 'note' slug fallback
  const direct = vault.nodes.get(ref);
  if (direct) return direct;
  const lower = ref.toLowerCase();
  for (const n of vault.nodes.values()) if (n.id.toLowerCase() === lower) return n;
  const slug = slugify(ref);
  for (const n of vault.nodes.values()) if (n.id === slug) return n;
  return undefined;
}

function idTaken(vault: LoadedVault, id: string): boolean {
  return vault.nodes.has(id) || (vault.files?.has(id.toLowerCase()) ?? false);
}

/** First free id derived from a title; also avoids filenames of unparsed notes. */
export function nextId(vault: LoadedVault, title: string): string {
  const base = slugify(title);
  if (!idTaken(vault, base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`;
    if (!idTaken(vault, candidate)) return candidate;
  }
  for (;;) {
    const candidate = `${base}-${Math.random().toString(36).slice(2, 8)}`;
    if (!idTaken(vault, candidate)) return candidate;
  }
}

let tmpSeq = 0;

/** Atomic write: unique tmp file + rename, so a concurrent reader never sees a half note. */
export async function writeNode(vault: LoadedVault, node: MemoryNode): Promise<string> {
  const folder = path.join(vault.dir, TYPE_FOLDER[node.type]);
  await fs.mkdir(folder, { recursive: true });
  const target = path.join(folder, `${node.id}.md`);
  // Never silently replace a file this node was not loaded from — on CREATE
  // or on UPDATE. The update path could clobber an unparseable note whose
  // filename matched a frontmatter id (proven by review). Updating in place
  // (node.path === target) is the only overwrite allowed.
  if (!node.path || path.resolve(node.path) !== path.resolve(target)) {
    const exists = await fs.access(target).then(() => true, () => false);
    if (exists) {
      throw new Error(
        `refusing to overwrite ${target}: it is not the file node "${node.id}" was loaded from`,
      );
    }
  }
  // Unique tmp name: pid alone collides when one process writes the same node
  // concurrently — the loser's rename threw ENOENT after the winner's data was
  // already replaced (proven by review).
  const tmp = `${target}.tmp-${process.pid}-${(tmpSeq++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  await fs.writeFile(tmp, serializeNode(node), 'utf8');
  await fs.rename(tmp, target);
  // If the node moved files on update, remove the stale copy.
  if (node.path && path.resolve(node.path) !== path.resolve(target)) {
    await fs.unlink(node.path).catch(() => {});
  }
  node.path = target;
  vault.nodes.set(node.id, node);
  vault.files?.add(node.id.toLowerCase());
  return target;
}

export function countEdges(vault: LoadedVault): number {
  let n = 0;
  for (const node of vault.nodes.values()) n += node.edges.length;
  return n;
}

const LOCK_STALE_MS = 10_000;
const LOCK_HEARTBEAT_MS = 3_000;
// Generous on purpose: acquisition is unfair (random backoff, no FIFO), so
// under heavy contention a waiter can be repeatedly outraced; 15s covers far
// more serialized work than any realistic agent write burst before erroring
// loudly. Fair queueing is a Phase 1 refinement.
const LOCK_WAIT_MS = 15_000;

/**
 * Cross-process advisory lock via atomic mkdir. Two MCP servers (Claude +
 * Codex) writing one vault raced load→write and silently lost data
 * last-write-wins; wrapping each write's load→write span fixes it.
 *
 * Hardened after a second adversarial pass proved three exclusion breaks:
 * - Steal is a rename to a per-process graveyard (atomic: exactly one of N
 *   waiting stealers wins; rm-then-mkdir let several enter together).
 * - The holder heartbeats the lock's mtime, so a slow-but-alive holder never
 *   looks stale and cannot be stolen from mid-write.
 * - Release checks an ownership token and only removes a lock it still owns —
 *   an unconditional finally-rm deleted the NEXT holder's lock in a cascade.
 */
export async function withVaultLock<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const lockDir = path.join(dir, '.lock');
  const ownerFile = path.join(lockDir, 'owner');
  const token = `${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
  await fs.mkdir(dir, { recursive: true });
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      await fs.mkdir(lockDir);
      await fs.writeFile(ownerFile, token, 'utf8');
      break;
    } catch {
      let st;
      try {
        st = await fs.stat(lockDir);
      } catch {
        continue; // lock vanished between mkdir and stat — retry immediately
      }
      if (Date.now() - st.mtimeMs > LOCK_STALE_MS) {
        // Re-check freshness right before the steal, then rename atomically:
        // whichever process wins the rename owns the corpse; losers loop.
        const graveyard = `${lockDir}.stale-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
        try {
          const st2 = await fs.stat(lockDir);
          if (Date.now() - st2.mtimeMs > LOCK_STALE_MS) {
            await fs.rename(lockDir, graveyard);
            await fs.rm(graveyard, { recursive: true, force: true }).catch(() => {});
          }
        } catch {
          /* another stealer won — loop and compete on mkdir */
        }
        continue;
      }
      if (Date.now() > deadline) {
        throw new Error(`vault is locked by another process (waited ${LOCK_WAIT_MS / 1000}s) — try again`);
      }
      await new Promise((r) => setTimeout(r, 25 + Math.random() * 50));
    }
  }
  const heartbeat = setInterval(() => {
    const now = new Date();
    fs.utimes(lockDir, now, now).catch(() => {});
  }, LOCK_HEARTBEAT_MS);
  heartbeat.unref?.();
  try {
    return await fn();
  } finally {
    clearInterval(heartbeat);
    try {
      const current = await fs.readFile(ownerFile, 'utf8');
      if (current === token) await fs.rm(lockDir, { recursive: true, force: true });
    } catch {
      /* lock was stolen or already gone — not ours to remove */
    }
  }
}
