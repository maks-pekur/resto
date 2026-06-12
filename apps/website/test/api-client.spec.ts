import { describe, it, expect, vi, afterEach } from 'vitest';
import type { MenuDto } from '@resto/api-client/public';

vi.mock('server-only', () => ({}));

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

const makeMockMenu = (): MenuDto => ({
  tenantId: 'tenant-1',
  version: 1,
  currency: 'EUR',
  brand: {
    id: 'brand-1',
    slug: 'acme',
    displayName: 'Acme Restaurant',
    theme: { primaryColor: '#16a34a', logoUrl: null, font: null },
  },
  categories: [],
  items: [],
  modifierGroups: [],
});

describe('fetchMenuPublic', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns MenuDto on 200', async () => {
    const menu = makeMockMenu();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(menu),
      }),
    );

    const { fetchMenuPublic } = await import('@/lib/api-client');
    const result = await fetchMenuPublic('acme');

    expect(result).toEqual(menu);
  });

  it('throws TenantNotFoundError on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    const { fetchMenuPublic, TenantNotFoundError } = await import('@/lib/api-client');
    await expect(fetchMenuPublic('ghost')).rejects.toBeInstanceOf(TenantNotFoundError);
  });

  it('throws TenantSuspendedError on 403', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));

    const { fetchMenuPublic, TenantSuspendedError } = await import('@/lib/api-client');
    await expect(fetchMenuPublic('suspended')).rejects.toBeInstanceOf(TenantSuspendedError);
  });

  it('throws generic Error on 500', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const { fetchMenuPublic } = await import('@/lib/api-client');
    await expect(fetchMenuPublic('broken')).rejects.toThrow('fetchMenuPublic failed: 500');
  });

  it('calls the API with x-tenant-slug header', async () => {
    const menu = makeMockMenu();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(menu),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { fetchMenuPublic } = await import('@/lib/api-client');
    await fetchMenuPublic('acme');

    const [_url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['x-tenant-slug']).toBe('acme');
  });
});

describe('env loader', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('applies DEV_DEFAULTS in test/development when vars are missing', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_API_ORIGIN', '');
    vi.stubEnv('WEBSITE_URL', '');
    vi.resetModules();

    const { apiOrigin, websiteUrl } = await import('@/lib/env');
    expect(apiOrigin()).toBe('http://localhost:3000');
    expect(websiteUrl()).toBe('http://localhost:3002');
  });

  it('throws WebsiteEnvValidationError in production when vars are missing', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_API_ORIGIN', '');
    vi.stubEnv('WEBSITE_URL', '');
    vi.resetModules();

    await expect(import('@/lib/env')).rejects.toThrow();
  });

  it('does NOT expose INTERNAL_API_TOKEN', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.resetModules();

    const envModule = await import('@/lib/env');
    expect('internalApiToken' in envModule).toBe(false);
    expect('INTERNAL_API_TOKEN' in envModule).toBe(false);
  });
});
