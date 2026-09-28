import { resolve as resolvePath } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts'],
    testTimeout: 10000,
    coverage: { reporter: ['text', 'html'] }
  },
  resolve: {
    alias: {
      '@folio/core': resolvePath(process.cwd(), 'packages/core/src/index.ts')
    }
  }
});
