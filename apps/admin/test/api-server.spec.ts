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

const fetchMock = vi.fn();
const originalFetch = globalThis.fetch;

const { apiFetch } = await import('../lib/api-server');

describe('apiFetch — X-Brand-Slug header', () => {
  beforeEach(() => {
    cookieEntries.length = 0;
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('forwards resto.active_brand cookie as X-Brand-Slug header', async () => {
    cookieEntries.push({ name: 'resto.active_brand', value: 'cafe-roma' });
    await apiFetch('/v1/menu');
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers['x-brand-slug']).toBe('cafe-roma');
  });

  it('omits X-Brand-Slug when resto.active_brand cookie is absent', async () => {
    await apiFetch('/v1/menu');
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers['x-brand-slug']).toBeUndefined();
  });

  it('does not duplicate the brand cookie in the cookie header (it is already part of getAll())', async () => {
    cookieEntries.push({ name: 'resto.active_brand', value: 'cafe-roma' });
    cookieEntries.push({ name: 'better-auth.session_token', value: 'abc' });
    await apiFetch('/v1/menu');
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers.cookie).toContain('resto.active_brand=cafe-roma');
    expect(headers.cookie).toContain('better-auth.session_token=abc');
    expect(headers['x-brand-slug']).toBe('cafe-roma');
  });
});
