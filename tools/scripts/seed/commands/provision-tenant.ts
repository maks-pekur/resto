import { z } from 'zod';
import { Currency, TenantSlug } from '@resto/domain';
import { ApiClient } from '../lib/api-client';
import { log, logWarn } from '../lib/logger';
import { parseFlags, requireFlag, type RuntimeOptions } from '../lib/options';
import {
  generateOwnerPassword,
  readPasswordFromStdin,
  assertPasswordFlagAllowed,
} from '../lib/password';
import { printCredentialsBlock } from '../lib/credentials-block';

const Input = z.object({
  slug: TenantSlug,
  displayName: z.string().min(1).max(120),
  defaultCurrency: Currency,
  locations: z.coerce.number().int().positive().default(1),
  ownerEmail: z.string().trim().toLowerCase().email().optional(),
  ownerName: z.string().min(1).max(120).optional(),
});

interface ProvisionTenantResponse {
  readonly id: string;
  readonly slug: string;
  readonly primaryDomain: string;
}

interface BootstrapOwnerResult {
  readonly tenantId: string;
  readonly userId: string;
  readonly email: string;
  readonly requiresPasswordChange: boolean;
}

interface OwnerCredentials {
  readonly password: string;
  readonly generated: boolean;
}

const resolveOwnerCredentials = async (
  flags: ReturnType<typeof parseFlags>,
): Promise<OwnerCredentials> => {
  const passwordFromFlag = flags.named.get('owner-password');
  const passwordStdin = flags.named.get('password-stdin') === 'true';

  if (passwordFromFlag) {
    assertPasswordFlagAllowed(process.env);
    return { password: passwordFromFlag, generated: false };
  }
  if (passwordStdin) {
    return { password: await readPasswordFromStdin(), generated: false };
  }
  return { password: generateOwnerPassword(), generated: true };
};

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
    ...(flags.named.has('owner-email') ? { ownerEmail: flags.named.get('owner-email') } : {}),
    ...(flags.named.has('owner-name') ? { ownerName: flags.named.get('owner-name') } : {}),
  });

  const ownerName = parsed.ownerName ?? 'Owner';

  // Resolve password early (fail fast before any HTTP call) only when owner bootstrapping is requested.
  const credentials = parsed.ownerEmail ? await resolveOwnerCredentials(flags) : undefined;

  if (options.dryRun) {
    log('provision-tenant.plan', { ...parsed });
    if (parsed.ownerEmail) {
      log('provision-tenant.bootstrap.plan', { tenant: parsed.slug, email: parsed.ownerEmail });
    }
    return;
  }

  const api = new ApiClient({ apiUrl: options.apiUrl, internalToken: options.internalToken });

  const tenant = await api.post<ProvisionTenantResponse>('/internal/v1/tenants', {
    slug: parsed.slug,
    displayName: parsed.displayName,
    defaultCurrency: parsed.defaultCurrency,
    locale: 'en',
  });

  if (parsed.locations !== 1) {
    logWarn('provision-tenant.locations-not-implemented', {
      requested: parsed.locations,
      note: 'multi-location lands with the locations slice (post-MVP-1)',
    });
  }

  if (!parsed.ownerEmail || !credentials) {
    log('provision-tenant.done', {
      tenantId: tenant.id,
      slug: tenant.slug,
      primaryDomain: tenant.primaryDomain,
    });
    return;
  }

  // Bootstrap the first owner via the same internal HTTP surface
  // (RES-113). The CLI no longer instantiates a Nest application
  // context — that path was incompatible with tsx + esbuild in
  // this monorepo setup, and an HTTP endpoint is the right
  // long-term shape regardless.
  const ownerEmail = parsed.ownerEmail;
  const owner = await api.post<BootstrapOwnerResult>(`/internal/v1/tenants/${tenant.id}/owner`, {
    email: ownerEmail,
    password: credentials.password,
    name: ownerName,
  });

  log('provision-tenant.bootstrap.done', {
    tenantId: owner.tenantId,
    userId: owner.userId,
    email: owner.email,
  });

  if (credentials.generated) {
    printCredentialsBlock(parsed.slug, ownerEmail, credentials.password);
  }
};
