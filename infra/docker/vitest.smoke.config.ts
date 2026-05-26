import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const HERE = dirname(fileURLToPath(import.meta.url));
const EVENTS_NM = resolve(HERE, '..', '..', 'packages', 'events', 'node_modules');

export default defineConfig({
  resolve: {
    alias: [
      { find: /^postgres$/, replacement: resolve(EVENTS_NM, 'postgres') },
      { find: /^nats$/, replacement: resolve(EVENTS_NM, 'nats') },
    ],
  },
  test: {
    globals: false,
    include: ['infra/docker/test-stack-smoke.spec.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
