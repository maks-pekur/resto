#!/usr/bin/env node
// Runs the test-stack smoke spec via the vitest binary hoisted into
// @resto/events (the only workspace package that depends on both `nats`
// and `postgres`, which the spec needs). The spec lives at
// infra/docker/test-stack-smoke.spec.ts and is intentionally NOT picked up
// by `pnpm test` — its compose up/down cost is too high to run by default.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const VITEST_BIN = resolve(REPO_ROOT, 'packages', 'events', 'node_modules', '.bin', 'vitest');
const CONFIG = resolve(REPO_ROOT, 'infra', 'docker', 'vitest.smoke.config.ts');

const result = spawnSync(VITEST_BIN, ['run', '--config', CONFIG], {
  stdio: 'inherit',
  cwd: REPO_ROOT,
});

if (result.error) {
  process.stderr.write(`Failed to invoke vitest: ${result.error.message}\n`);
  process.exit(1);
}
process.exit(result.status ?? 1);
