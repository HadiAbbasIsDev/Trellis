/**
 * Trellis Memory Graph — extension host entry.
 *
 * Reads the vault directly through @trellis/core, which build.mjs bundles
 * into dist/extension.js (same single-artifact pattern as the MCP server):
 * the .vsix ships zero runtime node_modules, no background process, and
 * nothing leaves the machine.
 */
import * as fs from 'node:fs';
import path from 'node:path';
import * as vscode from 'vscode';
import {
  TYPE_FOLDER,
  buildSupersededBy,
  extractWikilinks,
  loadVault,
  resolveNode,
  type LoadedVault,
} from '@trellis/core';
import { repairStalePaths, wireProject, type WireProjectOptions } from '@trellis/wiring';
import { GraphPanel, type GraphEdgeDatum, type GraphPayload } from './panel';

/**
 * The .vsix is self-sufficient: dist/ carries the MCP server bundle and the
 * hook scripts, so wiring points configs at the extension's own install dir.
 * An optional trellis.repoPath setting overrides with a checkout — useful in
 * development so wired projects track source instead of the packaged copy.
 */
function wireOptions(ctx: vscode.ExtensionContext): WireProjectOptions {
  const configured = vscode.workspace.getConfiguration('trellis').get<string>('repoPath')?.trim();
  if (configured) {
    const server = path.join(configured, 'packages/mcp/dist/server.js');
    if (fs.existsSync(server)) {
      return {
        serverPath: server,
        stopScript: path.join(configured, 'scripts/hooks/stop-guard.mjs'),
        journalScript: path.join(configured, 'scripts/hooks/journal.mjs'),
        hooks: true,
      };
    }
  }
  const dist = path.join(ctx.extensionPath, 'dist');
  return {
    serverPath: path.join(dist, 'server.js'),
    stopScript: path.join(dist, 'hooks', 'stop-guard.mjs'),
    journalScript: path.join(dist, 'hooks', 'journal.mjs'),
    hooks: true,
  };
}

/** fs.watch fires in bursts (tmp write + rename per node); coalesce them. */
const DEBOUNCE_MS = 500;
/** …but a sustained write stream must not starve refresh forever. */
const DEBOUNCE_MAX_WAIT_MS = 2000;

function vaultDir(): string | undefined {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) return undefined;
  // multi-root: prefer the first folder that actually has a vault — showing
  // folder[0]'s empty meter while folder[1] holds the graph misleads
  for (const f of folders) {
    const p = path.join(f.uri.fsPath, '.trellis');
    if (fs.existsSync(p)) return p;
  }
  return path.join(folders[0]!.uri.fsPath, '.trellis');
}

/** Same node/edge extraction as scripts/graph.ts, shipped as a message. Exported for tests. */
export function buildGraphPayload(vault: LoadedVault): GraphPayload {
  const superseded = buildSupersededBy(vault);
  const nodes = [...vault.nodes.values()].map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    summary: n.summary,
    body: n.body,
    confidence: n.confidence,
    updated: n.updated.slice(0, 10),
    tags: n.tags,
    superseded: superseded.has(n.id),
  }));
  const seen = new Set<string>();
  const edges: GraphEdgeDatum[] = [];
  for (const n of vault.nodes.values()) {
    for (const e of n.edges) {
      const t = resolveNode(vault, e.to);
      if (!t) continue;
      const key = `${n.id}|${e.rel}|${t.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ from: n.id, to: t.id, rel: e.rel, implicit: false });
    }
    for (const w of extractWikilinks(n.body)) {
      const t = resolveNode(vault, w);
      if (!t || t.id === n.id) continue;
      const key = `${n.id}|link|${t.id}`;
      if (seen.has(key) || edges.some((e) => e.from === n.id && e.to === t.id)) continue;
      seen.add(key);
      edges.push({ from: n.id, to: t.id, rel: 'wikilink', implicit: true });
    }
  }
  return { type: 'graph', nodes, edges, vault: vault.dir };
}

/**
 * Sum of `tokens` over today's entries in <vault>/.stats/log.jsonl — one JSON
 * object per line: {ts,tool,tokens,pid}. Missing file or corrupt lines mean 0,
 * never an error: the stats log is telemetry-free best-effort bookkeeping.
 */
async function tokensToday(dir: string): Promise<number> {
  let raw: string;
  try {
    raw = await fs.promises.readFile(path.join(dir, '.stats', 'log.jsonl'), 'utf8');
  } catch {
    return 0;
  }
  const now = new Date();
  let sum = 0;
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry = JSON.parse(trimmed) as { ts?: string | number; tokens?: number };
      const d = new Date(entry.ts ?? NaN);
      if (
        !Number.isNaN(d.getTime()) &&
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate() &&
        typeof entry.tokens === 'number' &&
        Number.isFinite(entry.tokens) &&
        entry.tokens > 0 // a corrupt negative line must not deduct from the meter
      ) {
        sum += entry.tokens;
      }
    } catch {
      /* a torn concurrent append is expected, not reportable */
    }
  }
  return sum;
}

function fmtTok(n: number): string {
  if (n >= 100_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

export function activate(context: vscode.ExtensionContext): void {
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.command = 'trellis.showGraph';
  context.subscriptions.push(status);

  let watchers: fs.FSWatcher[] = [];
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let firstPendingEvent = 0; // trailing debounce + max-wait: bursts coalesce, streams can't starve

  async function refresh(): Promise<void> {
    const dir = vaultDir();
    if (!dir) {
      status.hide();
      return;
    }
    try {
      const vault = await loadVault(dir);
      const tok = await tokensToday(dir);
      const n = vault.nodes.size;
      status.text = `$(circuit-board) ${n} ${n === 1 ? 'node' : 'nodes'} · ${fmtTok(tok)} tok today`;
      status.tooltip = `Trellis vault: ${dir}\nClick to open the memory graph`;
      status.show();
      GraphPanel.current?.post(buildGraphPayload(vault));
    } catch (err) {
      // never let a broken vault take the status bar down with it
      status.text = '$(circuit-board) trellis: vault error';
      status.tooltip = (err as Error).message;
      status.show();
    }
  }

  const onFsEvent = (): void => {
    const now = Date.now();
    if (firstPendingEvent === 0) firstPendingEvent = now;
    if (debounce) clearTimeout(debounce);
    const fire = (): void => {
      firstPendingEvent = 0;
      // re-arm first: new type folders (fallback mode) or a freshly created
      // vault need watchers before the refresh that reports them
      setupWatchers();
      void refresh();
    };
    // a sustained write stream (agent emitting stats every <500ms) starved
    // the trailing debounce indefinitely; cap the total delay
    if (now - firstPendingEvent >= DEBOUNCE_MAX_WAIT_MS) fire();
    else debounce = setTimeout(fire, DEBOUNCE_MS);
  };

  function setupWatchers(): void {
    for (const w of watchers) w.close();
    watchers = [];
    const dir = vaultDir();
    if (!dir) return;
    const add = (target: string, recursive = false): void => {
      try {
        watchers.push(fs.watch(target, { recursive }, onFsEvent));
      } catch {
        /* target vanished between existsSync and watch — next event re-arms */
      }
    };
    if (!fs.existsSync(dir)) {
      // vault not created yet — watch the workspace root for it to appear
      const root = path.dirname(dir);
      if (fs.existsSync(root)) add(root);
      return;
    }
    try {
      watchers.push(fs.watch(dir, { recursive: true }, onFsEvent));
    } catch {
      // recursive fs.watch is platform-dependent (throws on older Linux
      // hosts) — fall back to the vault root plus its known level-1 dirs
      add(dir);
      for (const sub of [...Object.values(TYPE_FOLDER), '.stats']) {
        const p = path.join(dir, sub);
        if (fs.existsSync(p)) add(p);
      }
    }
  }

  context.subscriptions.push(
    new vscode.Disposable(() => {
      if (debounce) clearTimeout(debounce);
      for (const w of watchers) w.close();
      watchers = [];
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      setupWatchers();
      void refresh();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('trellis.showGraph', () => {
      const dir = vaultDir();
      if (!dir) {
        void vscode.window.showWarningMessage(
          'Trellis: open a folder first — the vault lives at <workspace>/.trellis.',
        );
        return;
      }
      GraphPanel.createOrShow(async () => buildGraphPayload(await loadVault(dir)));
    }),

    vscode.commands.registerCommand('trellis.wireProject', () => {
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) {
        void vscode.window.showWarningMessage('Trellis: open a folder to wire it.');
        return;
      }
      try {
        const outcome = wireProject(folder.uri.fsPath, wireOptions(context));
        if (outcome.errors.length > 0) {
          void vscode.window.showWarningMessage(`Trellis: ${outcome.errors.join(' · ')}`);
        }
        const summary = outcome.messages.map((m) => m.split(path.sep).pop() ?? m).join(' · ');
        void vscode.window.showInformationMessage(`Trellis: ${summary || 'project wired.'} Restart agent sessions to pick it up.`);
        void refresh();
      } catch (err) {
        void vscode.window.showErrorMessage(`Trellis wire failed: ${(err as Error).message}`);
      }
    }),

    vscode.commands.registerCommand('trellis.openVault', () => {
      const dir = vaultDir();
      if (!dir) {
        void vscode.window.showWarningMessage('Trellis: open a folder first.');
        return;
      }
      if (!fs.existsSync(dir)) {
        void vscode.window.showWarningMessage(
          `Trellis: no vault at ${dir} yet — it is created on the first memory_write.`,
        );
        return;
      }
      void vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(dir));
    }),
  );

  setupWatchers();
  void refresh();

  // Extension updates move the install dir, silently orphaning wired configs.
  // Repair anything recognizably ours whose recorded path no longer exists.
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (folder) {
    try {
      const repaired = repairStalePaths(folder.uri.fsPath, wireOptions(context));
      if (repaired.messages.length > 0) {
        void vscode.window.showInformationMessage(
          `Trellis: ${repaired.messages.join(' · ')} — restart agent sessions to pick it up.`,
        );
      }
    } catch {
      /* repair is best-effort by design */
    }
  }
}

export function deactivate(): void {
  /* all cleanup is on context.subscriptions */
}
