import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { CountryCodeValue, TenantSlug } from '@resto/domain';
import { StartTenantOnboardingService } from '../../../src/contexts/tenancy/application/start-tenant-onboarding.service';
import type { PaymentProviderPort } from '../../../src/contexts/payments/domain/ports';
import type { TenantRepository } from '../../../src/contexts/tenancy/domain/ports';
import { Tenant, type TenantSnapshot } from '../../../src/contexts/tenancy/domain/tenant.aggregate';
import type { Env } from '../../../src/config/env.schema';
import { encodeOAuthState } from '../../../src/contexts/tenancy/domain/oauth-state';

const SECRET = 'super-secret-testing-value-32chars!!';
const ADMIN_WEB_URL = 'https://admin.example.com';

const makeTenantSnap = (slug: string, overrides: Partial<TenantSnapshot> = {}): TenantSnapshot => ({
  ...Tenant.provision({
    slug: TenantSlug.parse(slug),
    displayName: 'Acme',
    country: CountryCodeValue.parse('GB'),
    primaryDomainHostname: `${slug}.menu.resto.app`,
  }).toSnapshot(),
  ...overrides,
});

function makeService(
  repo: Partial<TenantRepository>,
  provider: Partial<PaymentProviderPort>,
  env: Partial<Env>,
): StartTenantOnboardingService {
  return new StartTenantOnboardingService(
    repo as TenantRepository,
    provider as PaymentProviderPort,
    env as Env,
  );
}

describe('StartTenantOnboardingService.handleOAuthCallback — Stripe return URL', () => {
  it('redirects to ${ADMIN_WEB_URL}/tenant/payouts — no per-tenant slug segment (D-20)', async () => {
    const tenantSnap = makeTenantSnap('acme');
    const nonce = randomUUID();
    const state = encodeOAuthState({ tenantId: tenantSnap.id, nonce }, SECRET);

    const repo: Partial<TenantRepository> = {
      findById: vi.fn().mockResolvedValue(tenantSnap),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const provider: Partial<PaymentProviderPort> = {
      exchangeOAuthCode: vi.fn().mockResolvedValue({ accountId: 'acct_test' }),
      retrieveAccount: vi
        .fn()
        .mockResolvedValue({ chargesEnabled: false, payoutsEnabled: false, requirementsDue: [] }),
    };
    const env: Partial<Env> = {
      ADMIN_WEB_URL,
      BETTER_AUTH_SECRET: SECRET,
      STRIPE_CONNECT_CLIENT_ID: 'ca_test',
      STRIPE_CONNECT_OAUTH_REDIRECT_URL: 'https://api.example.com/callback',
    };

    const service = makeService(repo, provider, env);
    const result = await service.handleOAuthCallback({ code: 'code', state, nonce });

    expect(result.redirectUrl).toBe(`${ADMIN_WEB_URL}/tenant/payouts`);
  });

  it('redirectUrl does NOT contain "/dashboard/"', async () => {
    const tenantSnap = makeTenantSnap('my-restaurant');
    const nonce = randomUUID();
    const state = encodeOAuthState({ tenantId: tenantSnap.id, nonce }, SECRET);

    const repo: Partial<TenantRepository> = {
      findById: vi.fn().mockResolvedValue(tenantSnap),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const provider: Partial<PaymentProviderPort> = {
      exchangeOAuthCode: vi.fn().mockResolvedValue({ accountId: 'acct_test2' }),
      retrieveAccount: vi
        .fn()
        .mockResolvedValue({ chargesEnabled: false, payoutsEnabled: false, requirementsDue: [] }),
    };
    const env: Partial<Env> = {
      ADMIN_WEB_URL,
      BETTER_AUTH_SECRET: SECRET,
      STRIPE_CONNECT_CLIENT_ID: 'ca_test',
      STRIPE_CONNECT_OAUTH_REDIRECT_URL: 'https://api.example.com/callback',
    };

    const service = makeService(repo, provider, env);
    const result = await service.handleOAuthCallback({ code: 'code', state, nonce });

    expect(result.redirectUrl).not.toContain('/dashboard/');
  });
});
