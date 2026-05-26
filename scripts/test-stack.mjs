#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPOSE_FILE = resolve(HERE, '..', 'infra', 'docker', 'docker-compose.test.yml');

const USAGE = `Usage: node scripts/test-stack.mjs <command>

Commands:
  up      Boot the ephemeral test stack (postgres + nats) and wait until healthy.
  down    Stop the stack and remove volumes.
  status  Show container status for the test stack.

The compose file is at: ${COMPOSE_FILE}
`;

const runCompose = (args) => {
  const result = spawnSync('docker', ['compose', '-f', COMPOSE_FILE, ...args], {
    stdio: 'inherit',
  });
  if (result.error) {
    process.stderr.write(`Failed to invoke docker: ${result.error.message}\n`);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
};

const cmd = process.argv[2];

switch (cmd) {
  case 'up':
    runCompose(['up', '-d', '--wait']);
    break;
  case 'down':
    runCompose(['down', '-v']);
    break;
  case 'status':
    runCompose(['ps']);
    break;
  default:
    process.stdout.write(USAGE);
    process.exit(cmd ? 1 : 1);
}
