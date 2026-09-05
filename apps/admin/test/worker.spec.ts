// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from '../worker/index';

const API_ORIGIN = 'https://api.example.invalid';

class FakeCache {
  readonly matchCalls: Request[] = [];
  readonly putCalls: { request: Request; response: Response }[] = [];

  match(request: Request): Promise<Response | undefined> {
    this.matchCalls.push(request);
    return Promise.resolve(undefined);
  }

  put(request: Request, response: Response): Promise<void> {
    this.putCalls.push({ request, response });
    return Promise.resolve();
  }
}

const makeAssets = () => ({
  fetch: vi.fn((request: Request) =>
    Promise.resolve(new Response(`asset:${new URL(request.url).pathname}`, { status: 200 })),
  ),
});

const makeEnv = (): { env: Env; assets: ReturnType<typeof makeAssets>; cache: FakeCache } => {
  const assets = makeAssets();
  const cache = new FakeCache();
  vi.stubGlobal('caches', { default: cache });
  return { env: { ASSETS: assets, API_ORIGIN }, assets, cache };
};

describe('admin worker', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(['admin.invalid', 'pizza.admin.invalid'])(
    'serves /, /login and /assets/* from ASSETS on %s',
    async (host) => {
      const { env, assets } = makeEnv();

      for (const path of ['/', '/login', '/assets/app.js']) {
        const request = new Request(`https://${host}${path}`);
        const response = await worker.fetch(request, env);
        expect(await response.text()).toBe(`asset:${path}`);
      }

      expect(assets.fetch).toHaveBeenCalledTimes(3);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each(['admin.invalid', 'pizza.admin.invalid'])(
    'proxies GET /v1/orders to the API origin with X-Forwarded-Host preserved for %s',
    async (host) => {
      const { env } = makeEnv();
      fetchMock.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));

      await worker.fetch(new Request(`https://${host}/v1/orders`), env);

      const [calledRequest] = fetchMock.mock.calls[0] as [Request, unknown];
      expect(calledRequest.url).toBe(`${API_ORIGIN}/v1/orders`);
      expect(calledRequest.headers.get('X-Forwarded-Host')).toBe(host);
      expect(calledRequest.headers.get('X-Forwarded-Proto')).toBe('https');
    },
  );

  it('proxies POST /api/auth/sign-in/email preserving method, body, cookie, content-type and authorization', async () => {
    const { env } = makeEnv();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const body = JSON.stringify({ email: 'a@b.com', password: 'secret' });
    const request = new Request('https://pizza.admin.invalid/api/auth/sign-in/email', {
      method: 'POST',
      body,
      headers: {
        'content-type': 'application/json',
        cookie: 'session=abc',
        authorization: 'Bearer xyz',
      },
    });

    await worker.fetch(request, env);

    const [calledRequest] = fetchMock.mock.calls[0] as [Request, unknown];
    expect(calledRequest.method).toBe('POST');
    expect(await calledRequest.clone().text()).toBe(body);
    expect(calledRequest.headers.get('Cookie')).toBe('session=abc');
    expect(calledRequest.headers.get('Content-Type')).toBe('application/json');
    expect(calledRequest.headers.get('Authorization')).toBe('Bearer xyz');
  });

  it('returns an origin Set-Cookie unmodified (F-41 regression net)', async () => {
    const { env } = makeEnv();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'set-cookie': 'better-auth.session=xyz; Domain=.admin.invalid' },
      }),
    );

    const response = await worker.fetch(
      new Request('https://pizza.admin.invalid/api/auth/sign-in/email', { method: 'POST' }),
      env,
    );

    expect(response.headers.get('set-cookie')).toBe(
      'better-auth.session=xyz; Domain=.admin.invalid',
    );
  });

  it('never touches the Cache API for any path', async () => {
    const { env, cache } = makeEnv();
    fetchMock.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));

    await worker.fetch(new Request('https://pizza.admin.invalid/v1/orders'), env);
    await worker.fetch(new Request('https://pizza.admin.invalid/'), env);

    expect(cache.matchCalls).toHaveLength(0);
    expect(cache.putCalls).toHaveLength(0);
  });

  it('tags every proxied response with X-Resto-Cache: BYPASS', async () => {
    const { env } = makeEnv();
    fetchMock.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));

    const response = await worker.fetch(new Request('https://pizza.admin.invalid/v1/orders'), env);

    expect(response.headers.get('X-Resto-Cache')).toBe('BYPASS');
  });

  it('opts the subrequest out of the zone cache', async () => {
    const { env } = makeEnv();
    fetchMock.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));

    await worker.fetch(new Request('https://pizza.admin.invalid/v1/orders'), env);

    const [, init] = fetchMock.mock.calls[0] as [
      Request,
      { cf?: { cacheTtl?: number; cacheEverything?: boolean } },
    ];
    expect(init.cf).toEqual({ cacheTtl: 0, cacheEverything: false });
  });

  it('falls through to ASSETS for a path outside /v1/ and /api/', async () => {
    const { env, assets } = makeEnv();

    const response = await worker.fetch(
      new Request('https://pizza.admin.invalid/dashboard/orders'),
      env,
    );

    expect(await response.text()).toBe('asset:/dashboard/orders');
    expect(assets.fetch).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
