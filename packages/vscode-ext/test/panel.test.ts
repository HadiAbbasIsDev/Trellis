import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoadedVault, MemoryNode } from '@trellis/core';

// The real 'vscode' module only exists inside the extension host; a factory
// mock lets the source modules load under vitest.
const created: FakePanel[] = [];
interface FakePanel {
  webview: {
    html: string;
    posted: unknown[];
    onMsg?: (m: unknown) => void;
    onDidReceiveMessage: (cb: (m: unknown) => void) => { dispose: () => void };
    postMessage: (m: unknown) => Promise<boolean>;
  };
  reveal: () => void;
  onDidDispose: (cb: () => void) => { dispose: () => void };
  disposeCb?: () => void;
}
vi.mock('vscode', () => ({
  ViewColumn: { Active: -1 },
  StatusBarAlignment: { Left: 1 },
  Disposable: class {
    constructor(private readonly fn?: () => void) {}
    dispose() { this.fn?.(); }
  },
  Uri: { file: (p: string) => ({ fsPath: p }) },
  commands: { registerCommand: vi.fn(), executeCommand: vi.fn() },
  workspace: { workspaceFolders: [], onDidChangeWorkspaceFolders: vi.fn() },
  window: {
    createStatusBarItem: vi.fn(),
    showErrorMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showInformationMessage: vi.fn(),
    createWebviewPanel: vi.fn(() => {
      const panel: FakePanel = {
        webview: {
          html: '',
          posted: [],
          onDidReceiveMessage(cb) { panel.webview.onMsg = cb; return { dispose() {} }; },
          postMessage(m) { panel.webview.posted.push(m); return Promise.resolve(true); },
        },
        reveal() {},
        onDidDispose(cb) { panel.disposeCb = cb; return { dispose() {} }; },
      };
      created.push(panel);
      return panel;
    }),
  },
}));

import { GraphPanel } from '../src/panel';
import { buildGraphPayload } from '../src/extension';

function mkNode(partial: Partial<MemoryNode> & Pick<MemoryNode, 'id' | 'type' | 'title'>): MemoryNode {
  const now = '2026-08-12T10:00:00.000Z';
  return {
    summary: `${partial.id} summary`,
    confidence: 0.8,
    tags: [],
    created: now,
    updated: now,
    last_confirmed: now,
    edges: [],
    body: '',
    path: `/v/${partial.type}s/${partial.id}.md`,
    ...partial,
  };
}

function mkVault(nodes: MemoryNode[]): LoadedVault {
  return { dir: '/v', nodes: new Map(nodes.map((n) => [n.id, n])), warnings: [] };
}

describe('buildGraphPayload', () => {
  it('mirrors scripts/graph.ts: typed edges, implicit wikilinks, superseded flags', () => {
    const vault = mkVault([
      mkNode({ id: 'a', type: 'decision', title: 'A', edges: [{ rel: 'supersedes', to: 'b' }] }),
      mkNode({ id: 'b', type: 'decision', title: 'B' }),
      mkNode({ id: 'c', type: 'gotcha', title: 'C', body: 'see [[a]] and [[missing]]' }),
    ]);
    const p = buildGraphPayload(vault);
    expect(p.type).toBe('graph');
    expect(p.vault).toBe('/v');
    expect(p.nodes).toHaveLength(3);
    expect(p.nodes.find((n) => n.id === 'b')?.superseded).toBe(true);
    expect(p.nodes.find((n) => n.id === 'a')?.superseded).toBe(false);
    expect(p.edges).toEqual([
      { from: 'a', to: 'b', rel: 'supersedes', implicit: false },
      { from: 'c', to: 'a', rel: 'wikilink', implicit: true },
    ]);
  });

  it('drops wikilinks already covered by a typed edge and unresolvable targets', () => {
    const vault = mkVault([
      mkNode({ id: 'a', type: 'component', title: 'A', edges: [{ rel: 'depends_on', to: 'b' }], body: '[[b]] [[nope]]' }),
      mkNode({ id: 'b', type: 'component', title: 'B' }),
    ]);
    expect(buildGraphPayload(vault).edges).toEqual([
      { from: 'a', to: 'b', rel: 'depends_on', implicit: false },
    ]);
  });
});

describe('GraphPanel', () => {
  beforeEach(() => {
    // reset the singleton between tests via the panel's own dispose hook
    created.at(-1)?.disposeCb?.();
    created.length = 0;
  });

  it('serves CSP-clean themed HTML and posts the graph only after ready', async () => {
    const payload = buildGraphPayload(mkVault([mkNode({ id: 'a', type: 'decision', title: 'A' })]));
    GraphPanel.createOrShow(async () => payload);
    const panel = created[0]!;
    const html = panel.webview.html;
    const nonce = /script-src 'nonce-([^']+)'/.exec(html)?.[1];
    expect(nonce).toBeTruthy();
    expect(html).toContain(`<script nonce="${nonce}">`);
    expect(html).not.toMatch(/ on\w+="/); // inline handlers die under a nonce CSP
    expect(html).toContain('--vscode-editor-background'); // themed
    expect(html).not.toMatch(/src=["']https?:/); // no remote resources
    expect(panel.webview.posted).toHaveLength(0); // nothing before the handshake

    panel.webview.onMsg?.({ type: 'ready' });
    await new Promise((r) => setImmediate(r));
    expect(panel.webview.posted).toEqual([payload]);
  });

  it('reuses one panel and swaps in the newest data provider', async () => {
    const first = buildGraphPayload(mkVault([mkNode({ id: 'a', type: 'decision', title: 'A' })]));
    const second = buildGraphPayload(mkVault([mkNode({ id: 'b', type: 'gotcha', title: 'B' })]));
    GraphPanel.createOrShow(async () => first);
    GraphPanel.createOrShow(async () => second); // second call must not create a panel
    expect(created).toHaveLength(1);
    await new Promise((r) => setImmediate(r));
    // reveal-refresh posts straight away with the swapped provider
    expect(created[0]!.webview.posted).toEqual([second]);
  });
});
