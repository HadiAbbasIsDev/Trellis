import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@trellis/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
      '@trellis/wiring': path.resolve(__dirname, 'packages/wiring/src/index.ts'),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts'],
  },
});
