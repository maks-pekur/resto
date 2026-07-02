import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { type BrandId, TenantId } from '@resto/domain';
import type { BrandSnapshot } from '../../../src/contexts/tenancy/domain/brand.aggregate';
import { StartBrandOnboardingService } from '../../../src/contexts/tenancy/application/start-brand-onboarding.service';
import type { PaymentProviderPort } from '../../../src/contexts/payments/domain/ports';
import type { BrandRepository } from '../../../src/contexts/tenancy/domain/ports';
import type { Env } from '../../../src/config/env.schema';
import { encodeOAuthState } from '../../../src/contexts/tenancy/domain/oauth-state';

const SECRET = 'super-secret-testing-value-32chars!!';
const ADMIN_WEB_URL = 'https://admin.example.com';

const makeBrandSnap = (overrides: Partial<BrandSnapshot> = {}): BrandSnapshot => ({
  id: randomUUID() as BrandId,
  tenantId: TenantId.parse(randomUUID()),
  slug: 'acme',
  displayName: 'Acme Brand',
  status: 'active',
  theme: null,
  paymentProvider: 'stripe',
  accountType: null,
  defaultCurrency: 'EUR',
  stripeAccountId: null,
  stripeChargesEnabled: false,
  stripePayoutsEnabled: false,
  stripeOnboardingStatus: 'not_started',
  stripeRequirementsDue: null,
  ...overrides,
});

function makeService(
  brandRepo: Partial<BrandRepository>,
  provider: Partial<PaymentProviderPort>,
  env: Partial<Env>,
): StartBrandOnboardingService {
  return new StartBrandOnboardingService(
    brandRepo as BrandRepository,
    provider as PaymentProviderPort,
    env as Env,
  );
}

describe('StartBrandOnboardingService — handleOAuthCallback Stripe return URL (Pitfall 4 regression)', () => {
  it('redirectUrl for brand slug "acme" equals ${ADMIN_WEB_URL}/acme/payouts', async () => {
    const brandId = randomUUID() as BrandId;
    const nonce = randomUUID();
    const brandSnap = makeBrandSnap({ id: brandId, slug: 'acme' });
    const state = encodeOAuthState({ brandId, nonce }, SECRET);

    const brandRepo: Partial<BrandRepository> = {
      findById: vi.fn().mockResolvedValue(brandSnap),
      updatePaymentConnection: vi.fn().mockResolvedValue(undefined),
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

    const service = makeService(brandRepo, provider, env);
    const result = await service.handleOAuthCallback({ code: 'code', state, nonce });

    expect((result as { redirectUrl: string }).redirectUrl).toBe(`${ADMIN_WEB_URL}/acme/payouts`);
  });

  it('redirectUrl does NOT contain "/dashboard/"', async () => {
    const brandId = randomUUID() as BrandId;
    const nonce = randomUUID();
    const brandSnap = makeBrandSnap({ id: brandId, slug: 'my-restaurant' });
    const state = encodeOAuthState({ brandId, nonce }, SECRET);

    const brandRepo: Partial<BrandRepository> = {
      findById: vi.fn().mockResolvedValue(brandSnap),
      updatePaymentConnection: vi.fn().mockResolvedValue(undefined),
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

    const service = makeService(brandRepo, provider, env);
    const result = await service.handleOAuthCallback({ code: 'code', state, nonce });

    expect((result as { redirectUrl: string }).redirectUrl).not.toContain('/dashboard/');
  });

  it('redirectUrl ends with /{slug}/payouts for an arbitrary slug', async () => {
    const brandId = randomUUID() as BrandId;
    const nonce = randomUUID();
    const slug = 'pizza-palace';
    const brandSnap = makeBrandSnap({ id: brandId, slug });
    const state = encodeOAuthState({ brandId, nonce }, SECRET);

    const brandRepo: Partial<BrandRepository> = {
      findById: vi.fn().mockResolvedValue(brandSnap),
      updatePaymentConnection: vi.fn().mockResolvedValue(undefined),
    };
    const provider: Partial<PaymentProviderPort> = {
      exchangeOAuthCode: vi.fn().mockResolvedValue({ accountId: 'acct_test3' }),
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

    const service = makeService(brandRepo, provider, env);
    const result = await service.handleOAuthCallback({ code: 'code', state, nonce });

    const { redirectUrl } = result as { redirectUrl: string };
    expect(redirectUrl).toMatch(new RegExp(`/${slug}/payouts$`));
    expect(redirectUrl).not.toContain('/dashboard/');
  });
});
