#!/usr/bin/env tsx
/**
 * D-4a-08 / Plan 04a-07: OpenAPI drift gate (root `pnpm openapi:check`).
 *
 * Runs the api package's `openapi:emit` (which writes
 * `docs/api/openapi.yaml`) and the api-client codegen (which writes
 * `packages/api-client/src/generated/api.ts`), then asks git whether the
 * working tree has any diff against the committed artefacts. If yes, the
 * developer forgot to commit the regenerated outputs after a controller
 * change — print a clear remediation message and exit non-zero.
 *
 * This script is the local-development analog of the CI workflow's
 * `openapi-drift` job (`.github/workflows/ci.yml`). Keeping both means a
 * regression caught in CI also reproduces locally with a single command.
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Note: `import.meta.dirname` is undefined when tsx loads this file via the
// CJS translator (see .github/workflows/ci.yml comment on the same regression
// in apps/api/src/openapi.ts). `fileURLToPath` is the portable equivalent.
const thisDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(thisDir, '..');

const run = (cmd: string, args: readonly string[], env: NodeJS.ProcessEnv = {}): void => {
  const result = spawnSync(cmd, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    console.error(`openapi:check: command failed: ${cmd} ${args.join(' ')}`);
    process.exit(result.status ?? 1);
  }
};

// AppModule wiring requires DB/NATS/S3 env vars before NestFactory can
// render the OpenAPI document, even though no real services are contacted
// during emit. Placeholders satisfy env-schema + adapter-construction
// validation; mirrors the CI workflow's env block.
const EMIT_ENV: NodeJS.ProcessEnv = {
  DATABASE_URL: 'postgres://x@localhost:5432/x',
  NATS_URL: 'nats://localhost:4222',
  NATS_DISABLED: 'true',
  OTEL_DISABLED: 'true',
  NODE_ENV: 'development',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_ACCESS_KEY: 'x',
  S3_SECRET_KEY: 'x',
};

console.log('openapi:check: regenerating docs/api/openapi.yaml ...');
run('pnpm', ['exec', 'nx', 'run', 'api:openapi:emit'], EMIT_ENV);

console.log('openapi:check: regenerating packages/api-client/src/generated/api.ts ...');
run('pnpm', ['exec', 'nx', 'run', 'api-client:gen']);

console.log('openapi:check: diffing against committed artefacts ...');
const diff = spawnSync(
  'git',
  [
    'diff',
    '--exit-code',
    '--',
    'docs/api/openapi.yaml',
    'packages/api-client/src/generated/api.ts',
  ],
  { cwd: repoRoot, stdio: 'inherit' },
);
if (diff.status !== 0) {
  console.error('');
  console.error('openapi:check: drift detected.');
  console.error(
    "Run 'pnpm exec nx run api:openapi:emit && pnpm exec nx run api-client:gen' and commit the result.",
  );
  process.exit(1);
}

console.log('openapi:check: artefacts are in sync.');
