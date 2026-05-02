import { z } from 'zod';
import { Currency, TenantSlug } from '@resto/domain';
import { ApiClient } from '../lib/api-client';
import { log, logWarn } from '../lib/logger';
import { parseFlags, requireFlag, type RuntimeOptions } from '../lib/options';

const Input = z.object({
  slug: TenantSlug,
  displayName: z.string().min(1).max(120),
  defaultCurrency: Currency,
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
    ...(flags.named.has('locations') ? { locations: flags.named.get('locations') } : {}),
  });

  if (options.dryRun) {
    log('provision-tenant.plan', { ...parsed });
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
  log('provision-tenant.done', {
    tenantId: tenant.id,
    slug: tenant.slug,
    primaryDomain: tenant.primaryDomain,
  });

  if (parsed.locations !== 1) {
    logWarn('provision-tenant.locations-not-implemented', {
      requested: parsed.locations,
      note: 'multi-location lands with the locations slice (post-MVP-1)',
    });
  }
};
