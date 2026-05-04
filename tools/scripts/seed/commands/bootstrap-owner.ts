import { z } from 'zod';
import { TenantSlug } from '@resto/domain';
import { ApiClient } from '../lib/api-client';
import { log } from '../lib/logger';
import { parseFlags, requireFlag, type RuntimeOptions } from '../lib/options';
import {
  generateOwnerPassword,
  readPasswordFromStdin,
  assertPasswordFlagAllowed,
} from '../lib/password';
import { printCredentialsBlock } from '../lib/credentials-block';

const Input = z.object({
  tenant: TenantSlug,
  email: z.string().trim().toLowerCase().email(),
  name: z.string().min(1).max(120).default('Owner'),
});

interface ProvisionLookup {
  readonly id: string;
  readonly slug: string;
}

interface BootstrapOwnerResult {
  readonly tenantId: string;
  readonly userId: string;
  readonly email: string;
  readonly requiresPasswordChange: boolean;
}

/**
 * Resolve a tenant id from its slug by re-issuing the (idempotent)
 * provision call — the api returns the existing tenant when the slug
 * matches an active row. Cheaper than introducing a dedicated
 * `GET /internal/v1/tenants/by-slug` just for this CLI.
 */
const resolveTenantId = async (api: ApiClient, slug: string): Promise<ProvisionLookup> =>
  api.post<ProvisionLookup>('/internal/v1/tenants', {
    slug,
    displayName: slug,
    defaultCurrency: 'USD',
    locale: 'en',
  });

export const runBootstrapOwner = async (
  argv: readonly string[],
  options: RuntimeOptions,
): Promise<void> => {
  const flags = parseFlags(argv);
  const parsed = Input.parse({
    tenant: requireFlag(flags, 'tenant'),
    email: requireFlag(flags, 'email'),
    ...(flags.named.has('name') ? { name: flags.named.get('name') } : {}),
  });

  const passwordFromFlag = flags.named.get('owner-password');
  const passwordStdin = flags.named.get('password-stdin') === 'true';
  let password: string;
  let generated = false;

  if (passwordFromFlag) {
    assertPasswordFlagAllowed(process.env);
    password = passwordFromFlag;
  } else if (passwordStdin) {
    password = await readPasswordFromStdin();
  } else {
    password = generateOwnerPassword();
    generated = true;
  }

  if (options.dryRun) {
    log('bootstrap-owner.plan', { tenant: parsed.tenant, email: parsed.email });
    return;
  }

  const api = new ApiClient({ apiUrl: options.apiUrl, internalToken: options.internalToken });

  const tenant = await resolveTenantId(api, parsed.tenant);
  const result = await api.post<BootstrapOwnerResult>(`/internal/v1/tenants/${tenant.id}/owner`, {
    email: parsed.email,
    password,
    name: parsed.name,
  });

  log('bootstrap-owner.done', {
    tenantId: result.tenantId,
    userId: result.userId,
    email: result.email,
  });

  if (generated) {
    printCredentialsBlock(parsed.tenant, parsed.email, password);
  }
};
