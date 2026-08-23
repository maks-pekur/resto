import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { CountryCodeValue, TenantId, TenantSlug } from '@resto/domain';
import { runInTenantContext } from '@resto/db';
import {
  encodeOAuthState,
  verifyOAuthState,
  OAUTH_NONCE_COOKIE,
} from '../../../src/contexts/tenancy/domain/oauth-state';
import { Tenant, type TenantSnapshot } from '../../../src/contexts/tenancy/domain/tenant.aggregate';
import { StartTenantOnboardingService } from '../../../src/contexts/tenancy/application/start-tenant-onboarding.service';
import type { PaymentProviderPort } from '../../../src/contexts/payments/domain/ports';
import type { TenantRepository } from '../../../src/contexts/tenancy/domain/ports';
import type { Env } from '../../../src/config/env.schema';

const SECRET = 'super-secret-testing-value-32chars!!';

const makeTenantSnap = (overrides: Partial<TenantSnapshot> = {}): TenantSnapshot => ({
  ...Tenant.provision({
    slug: TenantSlug.parse('test-tenant'),
    displayName: 'Test Tenant',
    country: CountryCodeValue.parse('GB'),
    primaryDomainHostname: 'test-tenant.menu.resto.app',
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

describe('oauth-state: encodeOAuthState / verifyOAuthState', () => {
  it('round-trips a valid state', () => {
    const tenantId = randomUUID();
    const nonce = randomUUID();
    const state = encodeOAuthState({ tenantId, nonce }, SECRET);
    const result = verifyOAuthState(state, SECRET);
    expect(result).not.toBeNull();
    expect(result?.tenantId).toBe(tenantId);
    expect(result?.nonce).toBe(nonce);
  });

  it('returns null for a tampered signature', () => {
    const state = encodeOAuthState({ tenantId: randomUUID(), nonce: randomUUID() }, SECRET);
    const tampered = state.slice(0, -4) + 'XXXX';
    expect(verifyOAuthState(tampered, SECRET)).toBeNull();
  });

  it('returns null when signed with a different secret', () => {
    const state = encodeOAuthState({ tenantId: randomUUID(), nonce: randomUUID() }, SECRET);
    expect(verifyOAuthState(state, 'wrong-secret-entirely-different!')).toBeNull();
  });

  it('returns null for a state with no separator dot', () => {
    expect(verifyOAuthState('nodothere', SECRET)).toBeNull();
  });

  it('returns null for an expired state (TTL 10 min)', () => {
    const realDateNow = Date.now;
    const nowMs = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => nowMs);
    const state = encodeOAuthState({ tenantId: randomUUID(), nonce: randomUUID() }, SECRET);
    vi.spyOn(Date, 'now').mockImplementation(() => nowMs + 11 * 60 * 1000);
    const result = verifyOAuthState(state, SECRET);
    vi.spyOn(Date, 'now').mockImplementation(realDateNow);
    expect(result).toBeNull();
  });
});

describe('StartTenantOnboardingService: OAuth start + callback', () => {
  it('startOAuth builds authorize URL with scope=read_write and signed state', async () => {
    const tenantSnap = makeTenantSnap();
    const clientId = 'ca_test123';
    const redirectUrl = 'http://localhost:3000/oauth/callback';
    const adminWebUrl = 'http://localhost:3001';

    const repo: Partial<TenantRepository> = {
      findCurrentTenant: vi.fn().mockResolvedValue(Tenant.fromSnapshot(tenantSnap)),
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

    const service = makeService(repo, provider, env);

    const result = await runInTenantContext({ tenantId: tenantSnap.id }, () =>
      service.startOAuth(),
    );

    expect(result).toHaveProperty('authorizeUrl');
    const url = new URL(result.authorizeUrl);
    expect(url.hostname).toBe('connect.stripe.com');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe(clientId);
    expect(url.searchParams.get('scope')).toBe('read_write');

    const stateParam = url.searchParams.get('state') ?? '';
    expect(stateParam).toBeTruthy();
    const verified = verifyOAuthState(stateParam, SECRET);
    expect(verified).not.toBeNull();
    expect(verified?.tenantId).toBe(tenantSnap.id);
  });

  it('handleOAuthCallback links the tenant as standard using state.tenantId, not a slug from the route', async () => {
    const tenantSnap = makeTenantSnap({ slug: TenantSlug.parse('real-tenant') });
    const nonce = randomUUID();
    const adminWebUrl = 'http://localhost:3001';
    const stripeUserId = 'acct_standard_456';

    let savedTenant: Tenant | undefined;
    const repo: Partial<TenantRepository> = {
      findById: vi.fn().mockResolvedValue(tenantSnap),
      save: vi.fn().mockImplementation((tenant: Tenant) => {
        savedTenant = tenant;
        return Promise.resolve();
      }),
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

    const state = encodeOAuthState({ tenantId: tenantSnap.id, nonce }, SECRET);
    const service = makeService(repo, provider, env);

    const result = await service.handleOAuthCallback({
      code: 'test_code_xyz',
      state,
      nonce,
    });

    expect(provider.exchangeOAuthCode).toHaveBeenCalledWith({ code: 'test_code_xyz' });
    expect(repo.save).toHaveBeenCalled();

    expect(savedTenant).toBeDefined();
    const snap = savedTenant?.toSnapshot();
    expect(snap?.accountType).toBe('standard');
    expect(snap?.stripeAccountId).toBe(stripeUserId);

    expect(result.redirectUrl).toContain(adminWebUrl);
    expect(result.redirectUrl).not.toMatch(/^\/\//);
  });

  it('handleOAuthCallback rejects a tampered state', async () => {
    const env: Partial<Env> = {
      STRIPE_CONNECT_CLIENT_ID: 'ca_test',
      STRIPE_CONNECT_OAUTH_REDIRECT_URL: 'http://localhost:3000/callback',
      ADMIN_WEB_URL: 'http://localhost:3001',
      BETTER_AUTH_SECRET: SECRET,
    };
    const repo: Partial<TenantRepository> = {
      findById: vi.fn(),
      save: vi.fn(),
    };
    const provider: Partial<PaymentProviderPort> = {
      exchangeOAuthCode: vi.fn(),
    };

    const service = makeService(repo, provider, env);
    const tamperedState = 'invalid.state.tampered';

    await expect(
      service.handleOAuthCallback({
        code: 'code',
        state: tamperedState,
        nonce: 'any',
      }),
    ).rejects.toThrow();

    expect(provider.exchangeOAuthCode).not.toHaveBeenCalled();
  });

  it('handleOAuthCallback rejects a replayed state (nonce mismatch)', async () => {
    const tenantId = TenantId.parse(randomUUID());
    const nonce = randomUUID();
    const differentNonce = randomUUID();
    const state = encodeOAuthState({ tenantId: tenantId, nonce }, SECRET);

    const env: Partial<Env> = {
      STRIPE_CONNECT_CLIENT_ID: 'ca_test',
      STRIPE_CONNECT_OAUTH_REDIRECT_URL: 'http://localhost:3000/callback',
      ADMIN_WEB_URL: 'http://localhost:3001',
      BETTER_AUTH_SECRET: SECRET,
    };
    const repo: Partial<TenantRepository> = {
      findById: vi.fn(),
      save: vi.fn(),
    };
    const provider: Partial<PaymentProviderPort> = {
      exchangeOAuthCode: vi.fn(),
    };

    const service = makeService(repo, provider, env);

    await expect(
      service.handleOAuthCallback({
        code: 'code',
        state,
        nonce: differentNonce,
      }),
    ).rejects.toThrow();

    expect(provider.exchangeOAuthCode).not.toHaveBeenCalled();
  });

  it('access_token is never stored on the tenant', async () => {
    const tenantSnap = makeTenantSnap();
    const nonce = randomUUID();
    const state = encodeOAuthState({ tenantId: tenantSnap.id, nonce }, SECRET);

    let savedTenant: Tenant | undefined;
    const repo: Partial<TenantRepository> = {
      findById: vi.fn().mockResolvedValue(tenantSnap),
      save: vi.fn().mockImplementation((tenant: Tenant) => {
        savedTenant = tenant;
        return Promise.resolve();
      }),
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

    const service = makeService(repo, provider, env);

    await service.handleOAuthCallback({ code: 'code', state, nonce });

    expect(savedTenant).toBeDefined();
    const snap = savedTenant?.toSnapshot();
    expect(JSON.stringify(snap)).not.toContain('access_token');
    expect(JSON.stringify(snap)).not.toContain('sk_live');
  });
});

describe('oauth-state: OAUTH_NONCE_COOKIE constant', () => {
  it('is a __Host- prefixed cookie name', () => {
    expect(OAUTH_NONCE_COOKIE).toBe('__Host-resto_oauth_nonce');
  });
});
