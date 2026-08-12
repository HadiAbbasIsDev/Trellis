import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// One self-contained CJS file: `node dist/server.js` with zero runtime deps
// on node_modules — the whole server travels as a single artifact.
await build({
  entryPoints: [path.join(root, 'packages/mcp/src/server.ts')],
  outfile: path.join(root, 'packages/mcp/dist/server.js'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  alias: { '@trellis/core': path.join(root, 'packages/core/src/index.ts') },
  logLevel: 'info',
});
