import { z } from 'zod';
import { NestFactory } from '@nestjs/core';
import { Currency, TenantSlug } from '@resto/domain';
import { BootstrapModule } from '@resto/api/contexts/identity/bootstrap.module';
import { BootstrapOwnerService } from '@resto/api/contexts/identity/application/bootstrap-owner.service';
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

  // Bootstrap the first owner in-process.
  const ownerEmail = parsed.ownerEmail;
  const app = await NestFactory.createApplicationContext(BootstrapModule, {
    logger: ['warn', 'error'],
  });
  try {
    const svc = app.get(BootstrapOwnerService);
    const result = await svc.execute({
      tenantSlug: parsed.slug,
      email: ownerEmail,
      password: credentials.password,
      name: ownerName,
    });

    log('provision-tenant.bootstrap.done', {
      tenantId: result.tenantId,
      userId: result.userId,
      email: result.email,
    });

    if (credentials.generated) {
      printCredentialsBlock(parsed.slug, ownerEmail, credentials.password);
    }
  } finally {
    await app.close();
  }
};
