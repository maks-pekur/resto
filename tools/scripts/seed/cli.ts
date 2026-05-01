#!/usr/bin/env tsx
import { runProvisionTenant } from './commands/provision-tenant';
import { runRotateTenantCredentials } from './commands/rotate-tenant-credentials';
import { runSeedMenu } from './commands/seed-menu';
import { logError } from './lib/logger';
import { resolveRuntimeOptions } from './lib/options';

const HELP = `
resto-seed — operator CLI for onboarding tenants

Commands:
  provision-tenant         --slug <slug> --name <displayName> --owner-email <e>
                           --initial-password <pw> [--currency USD] [--locations 1]
  seed-menu                --tenant <slug> --file <menu.yaml>
                           --owner-email <e> --owner-password <pw>
                           [--client-id resto-api] [--client-secret <s>]
  rotate-tenant-credentials --tenant <slug> --owner-email <e> --new-password <pw>

Global flags:
  --dry-run                Print intended changes without writing.
  --help                   Show this message.

Required env vars:
  INTERNAL_API_TOKEN       Shared secret for /internal/v1/* (matches api).
  KEYCLOAK_ADMIN_PASSWORD  Master-realm admin password.

Optional env vars:
  RESTO_API_URL            Default http://localhost:3000
  KEYCLOAK_ADMIN_URL       Default http://localhost:8080
  KEYCLOAK_ADMIN           Default 'admin'
  KEYCLOAK_REALM           Default 'resto'
`;

const main = async (): Promise<void> => {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(`${HELP}\n`);
    return;
  }
  const command = argv[0];
  const rest = argv.slice(1);
  const options = resolveRuntimeOptions(rest);

  switch (command) {
    case 'provision-tenant':
      await runProvisionTenant(rest, options);
      return;
    case 'seed-menu':
      await runSeedMenu(rest, options);
      return;
    case 'rotate-tenant-credentials':
      await runRotateTenantCredentials(rest, options);
      return;
    default:
      throw new Error(`Unknown command "${command ?? ''}". Run with --help for usage.`);
  }
};

main().catch((err: unknown) => {
  if (err instanceof Error) {
    logError('cli.failed', { name: err.name, message: err.message });
  } else {
    logError('cli.failed', { error: String(err) });
  }
  process.exit(1);
});
