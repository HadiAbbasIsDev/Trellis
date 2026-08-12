import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');

// Same single-artifact pattern as scripts/build.mjs: @trellis/core and
// @trellis/wiring are bundled straight from source, so the packaged extension
// carries zero runtime deps. Only 'vscode' stays external.
await build({
  entryPoints: [path.join(here, 'src/extension.ts')],
  outfile: path.join(here, 'dist/extension.js'),
  bundle: true,
  platform: 'node',
  target: 'node18', // VS Code 1.85's extension host
  format: 'cjs',
  external: ['vscode'],
  alias: {
    '@trellis/core': path.join(root, 'packages/core/src/index.ts'),
    '@trellis/wiring': path.join(root, 'packages/wiring/src/index.ts'),
  },
  logLevel: 'info',
});

// Self-sufficient .vsix: ship the MCP server and the hook scripts inside the
// extension so "Wire This Project" works on machines with no repo checkout.
const serverSrc = path.join(root, 'packages/mcp/dist/server.js');
if (!fs.existsSync(serverSrc)) {
  console.error('packages/mcp/dist/server.js missing — run `node scripts/build.mjs` first');
  process.exit(1);
}
fs.copyFileSync(serverSrc, path.join(here, 'dist/server.js'));
fs.mkdirSync(path.join(here, 'dist/hooks'), { recursive: true });
for (const script of ['stop-guard.mjs', 'journal.mjs']) {
  fs.copyFileSync(path.join(root, 'scripts/hooks', script), path.join(here, 'dist/hooks', script));
}
console.log('bundled server.js + hooks into dist/ for the .vsix');
