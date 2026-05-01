import { z } from 'zod';
import { TenantSlug } from '@resto/domain';
import { KeycloakAdmin } from '../lib/keycloak-admin';
import { log } from '../lib/logger';
import { parseFlags, requireFlag, type RuntimeOptions } from '../lib/options';

const Input = z.object({
  tenant: TenantSlug,
  ownerEmail: z.string().email(),
  newPassword: z.string().min(12),
});

export const runRotateTenantCredentials = async (
  argv: readonly string[],
  options: RuntimeOptions,
): Promise<void> => {
  const flags = parseFlags(argv);
  const parsed = Input.parse({
    tenant: requireFlag(flags, 'tenant'),
    ownerEmail: requireFlag(flags, 'owner-email'),
    newPassword: requireFlag(flags, 'new-password'),
  });

  if (options.dryRun) {
    log('rotate-tenant-credentials.plan', {
      tenant: parsed.tenant,
      ownerEmail: parsed.ownerEmail,
      newPassword: '***redacted***',
    });
    return;
  }

  const keycloak = new KeycloakAdmin({
    adminUrl: options.keycloakAdminUrl,
    adminUsername: options.keycloakAdminUsername,
    adminPassword: options.keycloakAdminPassword,
    realm: options.keycloakRealm,
  });

  await keycloak.resetUserPassword({
    email: parsed.ownerEmail,
    newPassword: parsed.newPassword,
  });

  log('rotate-tenant-credentials.done', {
    tenant: parsed.tenant,
    ownerEmail: parsed.ownerEmail,
  });
};
