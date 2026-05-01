import { z } from 'zod';
import { Currency, TenantSlug } from '@resto/domain';
import { ApiClient } from '../lib/api-client';
import { KeycloakAdmin } from '../lib/keycloak-admin';
import { log, logWarn } from '../lib/logger';
import { parseFlags, requireFlag, type RuntimeOptions } from '../lib/options';

const ROLE_OWNER = 'owner';
const REALM_ROLES = ['owner', 'manager', 'kitchen', 'waiter'] as const;

const Input = z.object({
  slug: TenantSlug,
  displayName: z.string().min(1).max(120),
  defaultCurrency: Currency,
  ownerEmail: z.string().email(),
  initialPassword: z.string().min(12),
  locations: z.coerce.number().int().positive().default(1),
});

interface ProvisionTenantResponse {
  readonly id: string;
  readonly slug: string;
  readonly primaryDomain: string;
}

export const runProvisionTenant = async (
  argv: readonly string[],
  options: RuntimeOptions,
): Promise<void> => {
  const flags = parseFlags(argv);
  const parsed = Input.parse({
    slug: requireFlag(flags, 'slug'),
    displayName: requireFlag(flags, 'name'),
    defaultCurrency: flags.named.get('currency') ?? 'USD',
    ownerEmail: requireFlag(flags, 'owner-email'),
    initialPassword: requireFlag(flags, 'initial-password'),
    ...(flags.named.has('locations') ? { locations: flags.named.get('locations') } : {}),
  });

  if (options.dryRun) {
    log('provision-tenant.plan', { ...parsed, initialPassword: '***redacted***' });
    return;
  }

  const api = new ApiClient({
    apiUrl: options.apiUrl,
    internalToken: options.internalToken,
  });

  const tenant = await api.post<ProvisionTenantResponse>('/internal/v1/tenants', {
    slug: parsed.slug,
    displayName: parsed.displayName,
    defaultCurrency: parsed.defaultCurrency,
    locale: 'en',
  });
  log('provision-tenant.api', {
    tenantId: tenant.id,
    slug: tenant.slug,
    primaryDomain: tenant.primaryDomain,
  });

  const keycloak = new KeycloakAdmin({
    adminUrl: options.keycloakAdminUrl,
    adminUsername: options.keycloakAdminUsername,
    adminPassword: options.keycloakAdminPassword,
    realm: options.keycloakRealm,
  });

  await keycloak.ensureRealm();
  await keycloak.ensureRealmRoles(REALM_ROLES);
  const owner = await keycloak.ensureUser({
    email: parsed.ownerEmail,
    role: ROLE_OWNER,
    initialPassword: parsed.initialPassword,
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
  });
  log('provision-tenant.keycloak', {
    tenantId: tenant.id,
    ownerEmail: parsed.ownerEmail,
    keycloakSubject: owner.subject,
  });

  if (parsed.locations !== 1) {
    logWarn('provision-tenant.locations-not-implemented', {
      requested: parsed.locations,
      note: 'multi-location lands with the locations slice (post-MVP-1)',
    });
  }

  log('provision-tenant.done', { tenantId: tenant.id, slug: tenant.slug });
};
