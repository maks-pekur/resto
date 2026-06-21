import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vitest/config';

// G-01: vitest uses Vite's transform pipeline which doesn't natively handle
// *.sql imports. This plugin mirrors esbuild's text loader: any *.sql import
// is returned as an ES module exporting the file content as a default string.
const sqlTextPlugin: Plugin = {
  name: 'sql-text',
  transform(_code, id) {
    if (!id.endsWith('.sql')) return;
    const content = readFileSync(id, 'utf8');
    return { code: `export default ${JSON.stringify(content)};`, map: null };
  },
};

export default defineConfig({
  plugins: [sqlTextPlugin],
  test: {
    globals: false,
    include: ['test/**/*.{spec,test}.ts', 'src/**/*.{spec,test}.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/cli/**', 'src/**/*.d.ts'],
      reporter: ['text', 'lcov'],
    },
  },
});
