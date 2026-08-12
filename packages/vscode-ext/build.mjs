import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');

// Same single-artifact pattern as scripts/build.mjs: @trellis/core is bundled
// straight from source, so the packaged extension carries zero runtime deps.
// Only 'vscode' stays external — the extension host provides it.
await build({
  entryPoints: [path.join(here, 'src/extension.ts')],
  outfile: path.join(here, 'dist/extension.js'),
  bundle: true,
  platform: 'node',
  target: 'node18', // VS Code 1.85's extension host
  format: 'cjs',
  external: ['vscode'],
  alias: { '@trellis/core': path.join(root, 'packages/core/src/index.ts') },
  logLevel: 'info',
});
