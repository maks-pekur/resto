import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const getHeader = vi.fn();
vi.mock('next/headers', () => ({
  headers: () => Promise.resolve({ get: getHeader }),
}));
vi.mock('../lib/env', () => ({
  apiOrigin: () => 'http://api.test',
  internalApiOrigin: () => 'http://api.internal.test',
}));

import { fetchMenuPublic, TenantNotFoundError } from '../lib/api-client';

afterEach(() => vi.restoreAllMocks());

describe('fetchMenuPublic', () => {
  it('targets internalApiOrigin(), not the public apiOrigin(), and forwards the incoming host as x-forwarded-host (07.5-14)', async () => {
    getHeader.mockReturnValue('cafe-demo.lvh.me');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ tenant: { slug: 'cafe-demo' }, items: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchMenuPublic();

    expect(fetchMock.mock.calls).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { headers: Record<string, string> },
    ];
    expect(url).toBe('http://api.internal.test/v1/menu');
    expect(init.headers).toEqual({ 'x-forwarded-host': 'cafe-demo.lvh.me' });
    expect(init.headers['x-tenant-slug']).toBeUndefined();
  });

  it('throws TenantNotFoundError on 404', async () => {
    getHeader.mockReturnValue('nope.lvh.me');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(fetchMenuPublic()).rejects.toBeInstanceOf(TenantNotFoundError);
  });
});
