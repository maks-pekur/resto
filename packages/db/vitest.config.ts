import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vitest/config';

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
