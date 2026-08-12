/**
 * Generate a self-contained interactive graph viewer for a Trellis vault.
 * Zero dependencies, works offline: one HTML file with an embedded canvas
 * force-directed layout. Preview of the Phase 3 VS Code webview panel.
 *
 * Usage: npm run graph            (reads ./.trellis, writes ./trellis-graph.html)
 *        tsx scripts/graph.ts --vault <dir> --out <file.html>
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildSupersededBy,
  extractWikilinks,
  loadVault,
  resolveNode,
} from '../packages/core/src/index';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

async function main() {
  const vaultDir = path.resolve(arg('--vault', '.trellis'));
  const outFile = path.resolve(arg('--out', 'trellis-graph.html'));
  const vault = await loadVault(vaultDir);
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
  const edges: { from: string; to: string; rel: string; implicit: boolean }[] = [];
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

  // '</' must not appear inside the inline <script>
  const data = JSON.stringify({ nodes, edges, vault: vaultDir }).replace(/<\//g, '<\\/');
  writeFileSync(outFile, template(data));
  console.log(`graph: ${nodes.length} nodes, ${edges.length} edges → ${outFile}`);
}

function template(data: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Trellis Graph</title>
<style>
  :root {
    --bg: #F4F6F7; --panel: #FFFFFF; --ink: #14191E; --ink-2: #55636D;
    --rule: #D5DDE1; --accent: #0B6B74;
    --c-decision: #0B6B74; --c-constraint: #6D4FA3; --c-component: #2563A8;
    --c-entity: #B07C10; --c-preference: #B0487C; --c-gotcha: #C05038; --c-session: #6E7C86;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0E1316; --panel: #151C20; --ink: #E4EAED; --ink-2: #97A5AD;
      --rule: #263137; --accent: #4FB8BF;
      --c-decision: #4FB8BF; --c-constraint: #A78BDA; --c-component: #6AA5DC;
      --c-entity: #D9A93E; --c-preference: #D97CAB; --c-gotcha: #DB7A5F; --c-session: #8B99A1;
    }
  }
  * { box-sizing: border-box; margin: 0; }
  body { background: var(--bg); color: var(--ink); font: 14px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; overflow: hidden; }
  #canvas { display: block; cursor: grab; }
  #canvas.dragging { cursor: grabbing; }
  #hud { position: fixed; top: 12px; left: 12px; display: flex; flex-direction: column; gap: 8px; max-width: 300px; }
  #hud .box { background: var(--panel); border: 1px solid var(--rule); border-radius: 4px; padding: 10px 12px; }
  #hud h1 { font-size: 14px; letter-spacing: -0.02em; }
  #hud .sub { font-size: 11px; color: var(--ink-2); margin-top: 2px; }
  #search { width: 100%; margin-top: 8px; padding: 5px 8px; font: inherit; font-size: 12px;
    background: var(--bg); color: var(--ink); border: 1px solid var(--rule); border-radius: 3px; }
  #legend { display: flex; flex-wrap: wrap; gap: 4px; }
  .chip { font-size: 10.5px; padding: 2px 8px; border-radius: 10px; border: 1px solid var(--rule);
    cursor: pointer; user-select: none; display: inline-flex; align-items: center; gap: 5px; background: var(--panel); }
  .chip .dot { width: 8px; height: 8px; border-radius: 50%; }
  .chip.off { opacity: 0.35; }
  #detail { position: fixed; top: 12px; right: 12px; width: 340px; max-height: calc(100vh - 24px);
    overflow-y: auto; background: var(--panel); border: 1px solid var(--rule); border-radius: 4px;
    padding: 14px; display: none; }
  #detail.show { display: block; }
  #detail .type { font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; }
  #detail h2 { font-size: 15px; margin: 4px 0 6px; letter-spacing: -0.02em; }
  #detail .summary { font-size: 12.5px; color: var(--ink-2); }
  #detail .meta { font-size: 11px; color: var(--ink-2); margin: 8px 0; padding: 6px 0; border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule); }
  #detail pre { font: 11.5px/1.55 inherit; white-space: pre-wrap; word-break: break-word; margin-top: 8px; }
  #detail .edges { margin-top: 10px; display: flex; flex-direction: column; gap: 3px; }
  #detail .edge-btn { font: 11px inherit; text-align: left; padding: 3px 7px; background: var(--bg);
    color: var(--ink); border: 1px solid var(--rule); border-radius: 3px; cursor: pointer; }
  #detail .edge-btn:hover { border-color: var(--accent); }
  #detail .close { position: absolute; top: 8px; right: 10px; background: none; border: none;
    color: var(--ink-2); font-size: 16px; cursor: pointer; }
  .badge { display: inline-block; font-size: 10px; padding: 1px 7px; border-radius: 9px;
    background: var(--c-gotcha); color: var(--panel); margin-left: 6px; vertical-align: 2px; }
  #hint { position: fixed; bottom: 10px; left: 12px; font-size: 10.5px; color: var(--ink-2); }
</style></head><body>
<canvas id="canvas"></canvas>
<div id="hud">
  <div class="box">
    <h1>Trellis Graph</h1>
    <div class="sub" id="stats"></div>
    <input id="search" type="search" placeholder="filter nodes…" autocomplete="off">
  </div>
  <div class="box" id="legend"></div>
</div>
<div id="detail"></div>
<div id="hint">drag nodes · drag background to pan · scroll to zoom · click node for detail</div>
<script>
const DATA = ${data};
const TYPES = ['decision','constraint','component','entity','preference','gotcha','session'];
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
let COLORS = {};
const refreshColors = () => { COLORS = Object.fromEntries(TYPES.map(t => [t, css('--c-' + t)])); };
refreshColors();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => setTimeout(refreshColors, 50));

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let W, H, DPR;
function resize() {
  DPR = devicePixelRatio || 1;
  W = innerWidth; H = innerHeight;
  canvas.width = W * DPR; canvas.height = H * DPR;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
}
resize(); addEventListener('resize', () => { resize(); wake(); });

const nodes = DATA.nodes.map((n, i) => ({
  ...n,
  x: Math.cos(i * 2.4) * (60 + i * 6), y: Math.sin(i * 2.4) * (60 + i * 6),
  vx: 0, vy: 0, deg: 0, pinned: false,
}));
const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
const edges = DATA.edges.filter(e => byId[e.from] && byId[e.to]);
edges.forEach(e => { byId[e.from].deg++; byId[e.to].deg++; });
nodes.forEach(n => { n.r = Math.min(15, 7 + n.deg * 1.4); });
document.getElementById('stats').textContent =
  nodes.length + ' nodes · ' + edges.length + ' edges · ' + DATA.vault;

const hiddenTypes = new Set();
let query = '';
const visible = n => !hiddenTypes.has(n.type);
const matches = n => !query || (n.id + ' ' + n.title + ' ' + n.summary).toLowerCase().includes(query);

// legend
const legend = document.getElementById('legend');
for (const t of TYPES) {
  const count = nodes.filter(n => n.type === t).length;
  if (count === 0) continue;
  const chip = document.createElement('span');
  chip.className = 'chip';
  chip.innerHTML = '<span class="dot" style="background:' + COLORS[t] + '"></span>' + t + ' ' + count;
  chip.onclick = () => {
    hiddenTypes.has(t) ? hiddenTypes.delete(t) : hiddenTypes.add(t);
    chip.classList.toggle('off'); wake();
  };
  legend.appendChild(chip);
}
document.getElementById('search').addEventListener('input', (e) => {
  query = e.target.value.trim().toLowerCase(); wake();
});

// camera
let scale = 1, ox = 0, oy = 0;
const toWorld = (px, py) => [ (px - W/2 - ox) / scale, (py - H/2 - oy) / scale ];

// physics
let temp = 1;
const wake = () => { temp = Math.max(temp, 0.35); };
function step() {
  const vis = nodes.filter(visible);
  for (let i = 0; i < vis.length; i++) {
    const a = vis[i];
    for (let j = i + 1; j < vis.length; j++) {
      const b = vis[j];
      let dx = a.x - b.x, dy = a.y - b.y;
      let d2 = dx * dx + dy * dy || 0.01;
      if (d2 > 160000) continue;
      const f = 1600 / d2;
      const d = Math.sqrt(d2);
      dx /= d; dy /= d;
      a.vx += dx * f; a.vy += dy * f;
      b.vx -= dx * f; b.vy -= dy * f;
    }
  }
  for (const e of edges) {
    const a = byId[e.from], b = byId[e.to];
    if (!visible(a) || !visible(b)) continue;
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const f = (d - 110) * 0.004;
    a.vx += dx / d * f * 2; a.vy += dy / d * f * 2;
    b.vx -= dx / d * f * 2; b.vy -= dy / d * f * 2;
  }
  for (const n of vis) {
    n.vx -= n.x * 0.0012; n.vy -= n.y * 0.0012; // gravity to center
    if (!n.pinned) { n.x += n.vx * temp; n.y += n.vy * temp; }
    n.vx *= 0.85; n.vy *= 0.85;
  }
  temp *= 0.995;
}

let selected = null;
function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.translate(W/2 + ox, H/2 + oy);
  ctx.scale(scale, scale);
  const ink2 = css('--ink-2'), rule = css('--rule');

  for (const e of edges) {
    const a = byId[e.from], b = byId[e.to];
    if (!visible(a) || !visible(b)) continue;
    const dim = query && !(matches(a) && matches(b));
    ctx.globalAlpha = dim ? 0.08 : (e.implicit ? 0.3 : 0.55);
    ctx.strokeStyle = e.rel === 'supersedes' ? css('--c-gotcha') : ink2;
    ctx.lineWidth = e.rel === 'supersedes' ? 1.6 : 1;
    ctx.setLineDash(e.implicit ? [3, 3] : (e.rel === 'supersedes' ? [6, 3] : []));
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx*dx + dy*dy) || 1;
    const tx = b.x - dx / d * (b.r + 4), ty = b.y - dy / d * (b.r + 4);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.setLineDash([]);
    // arrowhead
    const ang = Math.atan2(dy, dx);
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx - 7 * Math.cos(ang - 0.45), ty - 7 * Math.sin(ang - 0.45));
    ctx.lineTo(tx - 7 * Math.cos(ang + 0.45), ty - 7 * Math.sin(ang + 0.45));
    ctx.closePath();
    ctx.fillStyle = ctx.strokeStyle; ctx.fill();
    // rel label on typed edges when zoomed in
    if (!e.implicit && scale > 0.9 && !dim) {
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = ink2;
      ctx.font = '8.5px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(e.rel, (a.x + b.x) / 2, (a.y + b.y) / 2 - 4);
    }
  }

  for (const n of nodes) {
    if (!visible(n)) continue;
    const dim = query && !matches(n);
    ctx.globalAlpha = dim ? 0.12 : (n.superseded ? 0.45 : 1);
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    ctx.fillStyle = COLORS[n.type] || ink2;
    ctx.fill();
    if (n.superseded) { ctx.setLineDash([3,2]); ctx.strokeStyle = ink2; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]); }
    if (selected === n) {
      ctx.strokeStyle = css('--ink'); ctx.lineWidth = 2 / scale;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 3, 0, Math.PI * 2); ctx.stroke();
    }
    if (!dim && (scale > 0.55 || selected === n)) {
      ctx.fillStyle = css('--ink');
      ctx.font = '10px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'center';
      const label = n.title.length > 28 ? n.title.slice(0, 27) + '…' : n.title;
      ctx.fillText(label, n.x, n.y + n.r + 12);
    }
  }
  ctx.globalAlpha = 1;
}

function loop() { step(); draw(); requestAnimationFrame(loop); }
loop();

// interactions
let dragNode = null, panning = false, lastX = 0, lastY = 0, moved = 0;
const hit = (px, py) => {
  const [wx, wy] = toWorld(px, py);
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (!visible(n)) continue;
    const dx = wx - n.x, dy = wy - n.y;
    if (dx * dx + dy * dy <= (n.r + 4) * (n.r + 4)) return n;
  }
  return null;
};
canvas.addEventListener('mousedown', (e) => {
  lastX = e.clientX; lastY = e.clientY; moved = 0;
  dragNode = hit(e.clientX, e.clientY);
  if (dragNode) { dragNode.pinned = true; } else { panning = true; }
  canvas.classList.add('dragging');
});
addEventListener('mousemove', (e) => {
  const dx = e.clientX - lastX, dy = e.clientY - lastY;
  moved += Math.abs(dx) + Math.abs(dy);
  if (dragNode) {
    dragNode.x += dx / scale; dragNode.y += dy / scale;
    dragNode.vx = 0; dragNode.vy = 0; wake();
  } else if (panning) { ox += dx; oy += dy; }
  lastX = e.clientX; lastY = e.clientY;
});
addEventListener('mouseup', (e) => {
  if (dragNode) { dragNode.pinned = false; }
  if (moved < 5) {
    const n = hit(e.clientX, e.clientY);
    n ? select(n) : hideDetail();
  }
  dragNode = null; panning = false;
  canvas.classList.remove('dragging');
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const f = e.deltaY < 0 ? 1.12 : 1 / 1.12;
  scale = Math.min(4, Math.max(0.15, scale * f));
}, { passive: false });

// detail panel
const detail = document.getElementById('detail');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
function hideDetail() { selected = null; detail.classList.remove('show'); }
function select(n) {
  selected = n;
  const out = edges.filter(e => e.from === n.id);
  const inc = edges.filter(e => e.to === n.id);
  detail.innerHTML =
    '<button class="close" onclick="hideDetail()">×</button>' +
    '<div class="type" style="color:' + COLORS[n.type] + '">' + n.type +
    (n.superseded ? '<span class="badge">superseded</span>' : '') + '</div>' +
    '<h2>' + esc(n.title) + '</h2>' +
    '<div class="summary">' + esc(n.summary) + '</div>' +
    '<div class="meta">[' + n.id + '] · conf ' + n.confidence.toFixed(2) + ' · ' + n.updated +
    (n.tags.length ? ' · ' + n.tags.join(', ') : '') + '</div>' +
    (n.body ? '<pre>' + esc(n.body) + '</pre>' : '') +
    '<div class="edges">' +
    out.map(e => '<button class="edge-btn" data-id="' + e.to + '">' + e.rel + ' → ' + e.to + '</button>').join('') +
    inc.map(e => '<button class="edge-btn" data-id="' + e.from + '">← ' + e.rel + ' — ' + e.from + '</button>').join('') +
    '</div>';
  detail.classList.add('show');
  detail.querySelectorAll('.edge-btn').forEach(b => b.onclick = () => {
    const t = byId[b.dataset.id];
    if (t) { select(t); ox = -t.x * scale; oy = -t.y * scale; }
  });
}
window.hideDetail = hideDetail;
</script>
</body></html>`;
}

main().catch((e) => { console.error(e); process.exit(1); });
