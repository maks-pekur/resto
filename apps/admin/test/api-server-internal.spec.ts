import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('../lib/env', () => ({
  apiOrigin: () => 'http://api.test',
  internalApiToken: () => 'token-min-16-chars-xx',
}));
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ getAll: () => [], get: () => undefined }),
}));
vi.mock('../lib/api-server', () => ({
  getActiveTenantId: () => Promise.resolve(null),
}));
vi.mock('../lib/active-brand-cookie', () => ({
  readActiveBrand: () => Promise.resolve(null),
}));

const fetchMock = vi.fn<typeof fetch>();
const originalFetch = globalThis.fetch;

const { apiFetchInternal } = await import('../lib/api-server-internal');

const jsonResponse = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('apiFetchInternal — AbortSignal.timeout + retry-on-idempotent-5xx', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it('GET 503 retries exactly once (2 fetch calls total)', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ err: 'down' }, 503))
      .mockResolvedValueOnce(jsonResponse({ ok: true }, 200));
    const res = await apiFetchInternal('/internal/v1/x');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
    expect(res.ok).toBe(true);
  });

  it('POST 503 fires exactly once (no retry for mutations)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ err: 'down' }, 503));
    const res = await apiFetchInternal('/internal/v1/x', {
      method: 'POST',
      body: { a: 1 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(503);
    expect(res.ok).toBe(false);
  });

  it('AbortError yields { status: 0, ok: false, data: null }', async () => {
    fetchMock.mockImplementation(() => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      return Promise.reject(err);
    });
    const res = await apiFetchInternal('/internal/v1/x');
    expect(res.status).toBe(0);
    expect(res.ok).toBe(false);
    expect(res.data).toBeNull();
  });

  it('TimeoutError (DOMException name) yields { status: 0, ok: false, data: null }', async () => {
    fetchMock.mockImplementation(() => {
      const err = new Error('timeout');
      err.name = 'TimeoutError';
      return Promise.reject(err);
    });
    const res = await apiFetchInternal('/internal/v1/x');
    expect(res.status).toBe(0);
    expect(res.ok).toBe(false);
    expect(res.data).toBeNull();
  });

  it('method: "PATCH" typechecks and reaches the fetch call', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }, 200));
    const res = await apiFetchInternal('/internal/v1/x', {
      method: 'PATCH',
      body: { a: 1 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(init?.method).toBe('PATCH');
    expect(res.status).toBe(200);
  });

  it('every fetch call carries an AbortSignal (proves AbortSignal.timeout wiring)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }, 200));
    await apiFetchInternal('/internal/v1/x');
    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('forwards x-internal-token header on every call', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }, 200));
    await apiFetchInternal('/internal/v1/x');
    const [, init] = fetchMock.mock.calls[0] ?? [];
    const headers = init?.headers as Record<string, string>;
    expect(headers['x-internal-token']).toBe('token-min-16-chars-xx');
  });
});
