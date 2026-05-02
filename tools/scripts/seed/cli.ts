#!/usr/bin/env tsx
import { ZodError } from 'zod';
import { runBootstrapOwner } from './commands/bootstrap-owner';
import { runProvisionTenant } from './commands/provision-tenant';
import { runSeedMenu } from './commands/seed-menu';
import { logError } from './lib/logger';
import { resolveRuntimeOptions } from './lib/options';
import { PasswordFlagDisallowedError, PasswordStdinTtyError } from './lib/password';

const HELP = `
resto-seed — operator CLI for onboarding tenants

Commands:
  provision-tenant   --slug <slug> --name <displayName>
                     [--currency USD] [--locations 1]
                     [--owner-email <email>] [--owner-name "Owner Name"]
                     [--password-stdin] [--owner-password ... (dev only)]
  seed-menu          --tenant <slug> --file <menu.yaml>
  bootstrap-owner    --tenant <slug> --email <email>
                     [--name "Owner Name"] [--password-stdin]
                     [--owner-password ... (dev only)]

Global flags:
  --dry-run          Print intended changes without writing.
  --help             Show this message.

Required env vars:
  INTERNAL_API_TOKEN  Shared secret for /internal/v1/* (matches api).

Optional env vars:
  RESTO_API_URL       Default http://localhost:3000
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
    case 'bootstrap-owner':
      await runBootstrapOwner(rest, options);
      return;
    default:
      throw new Error(`Unknown command "${command ?? ''}". Run with --help for usage.`);
  }
};

const mapErrorToExitCode = (err: unknown): number => {
  if (err instanceof PasswordFlagDisallowedError || err instanceof PasswordStdinTtyError) {
    return 5;
  }
  if (err instanceof ZodError) {
    const hasEmailIssue = err.issues.some((issue) => issue.path.includes('email'));
    return hasEmailIssue ? 4 : 4;
  }
  if (err instanceof Error) {
    const code = (err as { code?: unknown }).code;
    switch (code) {
      case 'tenant_not_found':
        return 2;
      case 'owner_already_exists':
        return 3;
      case 'weak_password':
      case 'invalid_email':
        return 4;
      case 'password_flag_disallowed':
      case 'password_stdin_tty':
        return 5;
      default:
        return 1;
    }
  }
  return 1;
};

main().catch((err: unknown) => {
  const exitCode = mapErrorToExitCode(err);
  if (err instanceof Error) {
    logError('cli.failed', {
      name: err.name,
      message: err.message,
      ...(typeof (err as unknown as { code?: unknown }).code === 'string'
        ? { code: (err as unknown as { code: string }).code }
        : {}),
    });
  } else {
    logError('cli.failed', { error: String(err) });
  }
  process.exit(exitCode);
});
