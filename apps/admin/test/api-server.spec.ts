import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const cookieEntries: { name: string; value: string }[] = [];
vi.mock('next/headers', () => ({
  cookies: vi.fn(() =>
    Promise.resolve({
      getAll: () => cookieEntries,
      get: (name: string) => cookieEntries.find((c) => c.name === name) ?? undefined,
      set: vi.fn(),
    }),
  ),
}));
vi.mock('server-only', () => ({}));

const fetchMock = vi.fn<typeof fetch>();
const originalFetch = globalThis.fetch;

const { apiFetch } = await import('../lib/api-server');

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

// Default fetch mock: BA session lookup returns no active org so `apiFetch`
// gets a clean run; the actual target call returns `{ ok: true }`.
const installDefaultFetchMock = (): void => {
  fetchMock.mockImplementation((input) => {
    const url =
      typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    if (url.endsWith('/api/auth/get-session')) {
      return Promise.resolve(jsonResponse({ session: null }));
    }
    return Promise.resolve(jsonResponse({ ok: true }));
  });
};

const lastApiCall = (): { url: string; headers: Record<string, string> } => {
  const calls = fetchMock.mock.calls.filter(([input]) => {
    const url =
      typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    return !url.endsWith('/api/auth/get-session');
  });
  const [input, init] = calls.at(-1) ?? [];
  const url =
    typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
  const headers = (init?.headers ?? {}) as Record<string, string>;
  return { url, headers };
};

describe('apiFetch — X-Brand-Slug header', () => {
  beforeEach(() => {
    cookieEntries.length = 0;
    fetchMock.mockReset();
    installDefaultFetchMock();
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('forwards resto.active_brand cookie as X-Brand-Slug header', async () => {
    cookieEntries.push({ name: 'resto.active_brand', value: 'cafe-roma' });
    await apiFetch('/v1/menu');
    expect(lastApiCall().headers['x-brand-slug']).toBe('cafe-roma');
  });

  it('omits X-Brand-Slug when resto.active_brand cookie is absent', async () => {
    await apiFetch('/v1/menu');
    expect(lastApiCall().headers['x-brand-slug']).toBeUndefined();
  });

  it('does not duplicate the brand cookie in the cookie header (it is already part of getAll())', async () => {
    cookieEntries.push({ name: 'resto.active_brand', value: 'cafe-roma' });
    cookieEntries.push({ name: 'better-auth.session_token', value: 'abc' });
    await apiFetch('/v1/menu');
    const { headers } = lastApiCall();
    expect(headers.cookie).toContain('resto.active_brand=cafe-roma');
    expect(headers.cookie).toContain('better-auth.session_token=abc');
    expect(headers['x-brand-slug']).toBe('cafe-roma');
  });
});

describe('apiFetch — X-Tenant-Id header (RES-181)', () => {
  beforeEach(() => {
    cookieEntries.length = 0;
    fetchMock.mockReset();
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('forwards BA activeOrganizationId as X-Tenant-Id when an operator session is present', async () => {
    cookieEntries.push({ name: 'better-auth.session_token', value: 'abc' });
    fetchMock.mockImplementation((input) => {
      const url =
        typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.endsWith('/api/auth/get-session')) {
        return Promise.resolve(
          jsonResponse({ session: { activeOrganizationId: 'tenant-uuid-1' } }),
        );
      }
      return Promise.resolve(jsonResponse({ ok: true }));
    });

    await apiFetch('/v1/me/brands');

    expect(lastApiCall().headers['x-tenant-id']).toBe('tenant-uuid-1');
  });

  it('omits X-Tenant-Id when no BA session cookie is set', async () => {
    installDefaultFetchMock();
    await apiFetch('/v1/me/brands');
    expect(lastApiCall().headers['x-tenant-id']).toBeUndefined();
  });

  it('omits X-Tenant-Id when BA session has no activeOrganizationId', async () => {
    cookieEntries.push({ name: 'better-auth.session_token', value: 'abc' });
    installDefaultFetchMock();
    await apiFetch('/v1/me/brands');
    expect(lastApiCall().headers['x-tenant-id']).toBeUndefined();
  });

  it('does NOT trigger a session lookup when fetching /api/auth/get-session itself', async () => {
    cookieEntries.push({ name: 'better-auth.session_token', value: 'abc' });
    installDefaultFetchMock();
    await apiFetch('/api/auth/get-session');
    // Only ONE outbound fetch — the direct call. No recursion.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
