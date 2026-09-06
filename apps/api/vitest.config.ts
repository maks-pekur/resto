import type { Plugin } from 'vitest/config';
import { defineConfig } from 'vitest/config';

const sqlTextLoader = (): Plugin => ({
  name: 'sql-text-loader',
  enforce: 'pre',
  transform(code, id) {
    if (!id.endsWith('.sql')) return null;
    return { code: `export default ${JSON.stringify(code)};`, map: null };
  },
});

export default defineConfig({
  plugins: [sqlTextLoader()],
  test: {
    globals: false,
    setupFiles: ['./test/setup-env.ts'],
    include: ['test/**/*.{spec,test}.ts', 'src/**/*.{spec,test}.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
