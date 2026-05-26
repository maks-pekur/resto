import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    include: ['test/**/*.{spec,test}.ts'],
    testTimeout: 30_000,
  },
});
