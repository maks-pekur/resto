import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { type BrandId, TenantId } from '@resto/domain';
import { runInTenantContext } from '@resto/db';
import {
  encodeOAuthState,
  verifyOAuthState,
  OAUTH_NONCE_COOKIE,
} from '../../../src/contexts/tenancy/domain/oauth-state';
import type { BrandSnapshot } from '../../../src/contexts/tenancy/domain/brand.aggregate';
import { StartBrandOnboardingService } from '../../../src/contexts/tenancy/application/start-brand-onboarding.service';
import type { PaymentProviderPort } from '../../../src/contexts/payments/domain/ports';
import type { BrandRepository } from '../../../src/contexts/tenancy/domain/ports';
import type { Env } from '../../../src/config/env.schema';

const SECRET = 'super-secret-testing-value-32chars!!';

const makeBrandSnap = (overrides: Partial<BrandSnapshot> = {}): BrandSnapshot => ({
  id: randomUUID() as BrandId,
  tenantId: TenantId.parse(randomUUID()),
  slug: 'test-brand',
  displayName: 'Test Brand',
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
  const svc = new StartBrandOnboardingService(
    brandRepo as BrandRepository,
    provider as PaymentProviderPort,
    env as Env,
  );
  return svc;
}

describe('oauth-state: encodeOAuthState / verifyOAuthState', () => {
  it('round-trips a valid state', () => {
    const brandId = randomUUID();
    const nonce = randomUUID();
    const state = encodeOAuthState({ brandId, nonce }, SECRET);
    const result = verifyOAuthState(state, SECRET);
    expect(result).not.toBeNull();
    expect(result?.brandId).toBe(brandId);
    expect(result?.nonce).toBe(nonce);
  });

  it('returns null for a tampered signature', () => {
    const state = encodeOAuthState({ brandId: randomUUID(), nonce: randomUUID() }, SECRET);
    const tampered = state.slice(0, -4) + 'XXXX';
    expect(verifyOAuthState(tampered, SECRET)).toBeNull();
  });

  it('returns null when signed with a different secret', () => {
    const state = encodeOAuthState({ brandId: randomUUID(), nonce: randomUUID() }, SECRET);
    expect(verifyOAuthState(state, 'wrong-secret-entirely-different!')).toBeNull();
  });

  it('returns null for a state with no separator dot', () => {
    expect(verifyOAuthState('nodothere', SECRET)).toBeNull();
  });

  it('returns null for an expired state (TTL 10 min)', () => {
    const realDateNow = Date.now;
    const nowMs = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => nowMs);
    const state = encodeOAuthState({ brandId: randomUUID(), nonce: randomUUID() }, SECRET);
    vi.spyOn(Date, 'now').mockImplementation(() => nowMs + 11 * 60 * 1000);
    const result = verifyOAuthState(state, SECRET);
    vi.spyOn(Date, 'now').mockImplementation(realDateNow);
    expect(result).toBeNull();
  });
});

describe('StartBrandOnboardingService: OAuth start + callback', () => {
  it('startOAuth builds authorize URL with scope=read_write and signed state', async () => {
    const brandId = randomUUID() as BrandId;
    const brandSnap = makeBrandSnap({ id: brandId });
    const clientId = 'ca_test123';
    const redirectUrl = 'http://localhost:3000/oauth/callback';
    const adminWebUrl = 'http://localhost:3001';

    const brandRepo: Partial<BrandRepository> = {
      findByTenantAndSlug: vi.fn().mockResolvedValue(brandSnap),
      updatePaymentConnection: vi.fn().mockResolvedValue(undefined),
    };
    const provider: Partial<PaymentProviderPort> = {
      exchangeOAuthCode: vi.fn().mockResolvedValue({ accountId: 'acct_standard_123' }),
    };
    const env: Partial<Env> = {
      STRIPE_CONNECT_CLIENT_ID: clientId,
      STRIPE_CONNECT_OAUTH_REDIRECT_URL: redirectUrl,
      ADMIN_WEB_URL: adminWebUrl,
      BETTER_AUTH_SECRET: SECRET,
    };

    const service = makeService(brandRepo, provider, env);

    const tenantId = TenantId.parse(randomUUID());
    const result = await runInTenantContext({ tenantId, brandId }, () =>
      service.startOAuth('test-brand'),
    );

    expect(result).toHaveProperty('authorizeUrl');
    const url = new URL((result as { authorizeUrl: string }).authorizeUrl);
    expect(url.hostname).toBe('connect.stripe.com');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe(clientId);
    expect(url.searchParams.get('scope')).toBe('read_write');

    const stateParam = url.searchParams.get('state') ?? '';
    expect(stateParam).toBeTruthy();
    const verified = verifyOAuthState(stateParam, SECRET);
    expect(verified).not.toBeNull();
    expect(verified?.brandId).toBe(brandId);
  });

  it('handleOAuthCallback links brand as standard using state.brandId not slug', async () => {
    const brandId = randomUUID() as BrandId;
    const nonce = randomUUID();
    const adminWebUrl = 'http://localhost:3001';
    const stripeUserId = 'acct_standard_456';

    const brandSnap = makeBrandSnap({ id: brandId, slug: 'real-brand' });

    const brandRepo: Partial<BrandRepository> = {
      findByTenantAndSlug: vi.fn().mockResolvedValue(brandSnap),
      findById: vi.fn().mockResolvedValue(brandSnap),
      updatePaymentConnection: vi.fn().mockResolvedValue(undefined),
    };
    const provider: Partial<PaymentProviderPort> = {
      exchangeOAuthCode: vi.fn().mockResolvedValue({ accountId: stripeUserId }),
      retrieveAccount: vi
        .fn()
        .mockResolvedValue({ chargesEnabled: false, payoutsEnabled: false, requirementsDue: [] }),
    };
    const env: Partial<Env> = {
      STRIPE_CONNECT_CLIENT_ID: 'ca_test',
      STRIPE_CONNECT_OAUTH_REDIRECT_URL: 'http://localhost:3000/callback',
      ADMIN_WEB_URL: adminWebUrl,
      BETTER_AUTH_SECRET: SECRET,
    };

    const state = encodeOAuthState({ brandId, nonce }, SECRET);
    const service = makeService(brandRepo, provider, env);

    const result = await service.handleOAuthCallback({
      code: 'test_code_xyz',
      state,
      nonce,
      slugFromPath: 'different-slug-that-should-be-ignored',
    });

    expect(provider.exchangeOAuthCode).toHaveBeenCalledWith({ code: 'test_code_xyz' });
    expect(brandRepo.updatePaymentConnection).toHaveBeenCalled();

    const firstCallArg = (brandRepo.updatePaymentConnection as ReturnType<typeof vi.fn>).mock.calls
      .at(0)
      ?.at(0) as { toSnapshot: () => BrandSnapshot } | undefined;
    expect(firstCallArg).toBeDefined();
    const snap = (firstCallArg as { toSnapshot: () => BrandSnapshot }).toSnapshot();
    expect(snap.accountType).toBe('standard');
    expect(snap.stripeAccountId).toBe(stripeUserId);

    const redirectUrl = (result as { redirectUrl: string }).redirectUrl;
    expect(redirectUrl).toContain(adminWebUrl);
    expect(redirectUrl).not.toMatch(/^\/\//);
  });

  it('handleOAuthCallback rejects a tampered state', async () => {
    const env: Partial<Env> = {
      STRIPE_CONNECT_CLIENT_ID: 'ca_test',
      STRIPE_CONNECT_OAUTH_REDIRECT_URL: 'http://localhost:3000/callback',
      ADMIN_WEB_URL: 'http://localhost:3001',
      BETTER_AUTH_SECRET: SECRET,
    };
    const brandRepo: Partial<BrandRepository> = {
      findById: vi.fn(),
      updatePaymentConnection: vi.fn(),
    };
    const provider: Partial<PaymentProviderPort> = {
      exchangeOAuthCode: vi.fn(),
    };

    const service = makeService(brandRepo, provider, env);
    const tamperedState = 'invalid.state.tampered';

    await expect(
      service.handleOAuthCallback({
        code: 'code',
        state: tamperedState,
        nonce: 'any',
        slugFromPath: 'brand',
      }),
    ).rejects.toThrow();

    expect(provider.exchangeOAuthCode).not.toHaveBeenCalled();
  });

  it('handleOAuthCallback rejects a replayed state (nonce mismatch)', async () => {
    const brandId = randomUUID() as BrandId;
    const nonce = randomUUID();
    const differentNonce = randomUUID();
    const state = encodeOAuthState({ brandId, nonce }, SECRET);

    const env: Partial<Env> = {
      STRIPE_CONNECT_CLIENT_ID: 'ca_test',
      STRIPE_CONNECT_OAUTH_REDIRECT_URL: 'http://localhost:3000/callback',
      ADMIN_WEB_URL: 'http://localhost:3001',
      BETTER_AUTH_SECRET: SECRET,
    };
    const brandRepo: Partial<BrandRepository> = {
      findById: vi.fn(),
      updatePaymentConnection: vi.fn(),
    };
    const provider: Partial<PaymentProviderPort> = {
      exchangeOAuthCode: vi.fn(),
    };

    const service = makeService(brandRepo, provider, env);

    await expect(
      service.handleOAuthCallback({
        code: 'code',
        state,
        nonce: differentNonce,
        slugFromPath: 'brand',
      }),
    ).rejects.toThrow();

    expect(provider.exchangeOAuthCode).not.toHaveBeenCalled();
  });

  it('access_token is never stored on the brand', async () => {
    const brandId = randomUUID() as BrandId;
    const nonce = randomUUID();
    const state = encodeOAuthState({ brandId, nonce }, SECRET);
    const brandSnap = makeBrandSnap({ id: brandId });

    const brandRepo: Partial<BrandRepository> = {
      findById: vi.fn().mockResolvedValue(brandSnap),
      findByTenantAndSlug: vi.fn().mockResolvedValue(brandSnap),
      updatePaymentConnection: vi.fn().mockResolvedValue(undefined),
    };
    const provider: Partial<PaymentProviderPort> = {
      exchangeOAuthCode: vi
        .fn()
        .mockResolvedValue({ accountId: 'acct_std_789', access_token: 'sk_live_DEPRECATED' }),
      retrieveAccount: vi
        .fn()
        .mockResolvedValue({ chargesEnabled: false, payoutsEnabled: false, requirementsDue: [] }),
    };
    const env: Partial<Env> = {
      STRIPE_CONNECT_CLIENT_ID: 'ca_test',
      STRIPE_CONNECT_OAUTH_REDIRECT_URL: 'http://localhost:3000/callback',
      ADMIN_WEB_URL: 'http://localhost:3001',
      BETTER_AUTH_SECRET: SECRET,
    };

    const service = makeService(brandRepo, provider, env);

    await service.handleOAuthCallback({ code: 'code', state, nonce, slugFromPath: 'brand' });

    const firstCallArg2 = (brandRepo.updatePaymentConnection as ReturnType<typeof vi.fn>).mock.calls
      .at(0)
      ?.at(0) as { toSnapshot: () => BrandSnapshot } | undefined;
    expect(firstCallArg2).toBeDefined();
    const snap = (firstCallArg2 as { toSnapshot: () => BrandSnapshot }).toSnapshot();
    expect(JSON.stringify(snap)).not.toContain('access_token');
    expect(JSON.stringify(snap)).not.toContain('sk_live');
  });
});

describe('oauth-state: OAUTH_NONCE_COOKIE constant', () => {
  it('is a __Host- prefixed cookie name', () => {
    expect(OAUTH_NONCE_COOKIE).toBe('__Host-resto_oauth_nonce');
  });
});
