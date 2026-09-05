// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from '../worker/index';

const API_ORIGIN = 'https://api.example.invalid';

class FakeCache {
  private readonly store = new Map<string, Response>();
  readonly matchCalls: Request[] = [];
  readonly putCalls: { request: Request; response: Response }[] = [];

  match(request: Request): Promise<Response | undefined> {
    this.matchCalls.push(request);
    return Promise.resolve(this.store.get(request.url));
  }

  put(request: Request, response: Response): Promise<void> {
    this.putCalls.push({ request, response });
    const throwFrozen = (): never => {
      throw new TypeError('immutable headers (Cache API)');
    };
    Object.defineProperty(response.headers, 'set', { value: throwFrozen });
    Object.defineProperty(response.headers, 'append', { value: throwFrozen });
    Object.defineProperty(response.headers, 'delete', { value: throwFrozen });
    this.store.set(request.url, response);
    return Promise.resolve();
  }
}

const makeCtx = () => {
  const pending: Promise<unknown>[] = [];
  return {
    waitUntil(promise: Promise<unknown>): void {
      pending.push(promise);
    },
    async flush(): Promise<void> {
      await Promise.all(pending);
    },
  };
};

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

const originJson = (body: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });

describe('qr-menu worker', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('serves / and /assets/app.js from ASSETS with no origin fetch', async () => {
    const { env, assets } = makeEnv();
    const ctx = makeCtx();

    for (const path of ['/', '/assets/app.js']) {
      const request = new Request(`https://pizza.guest.invalid${path}`);
      const response = await worker.fetch(request, env, ctx);
      expect(await response.text()).toBe(`asset:${path}`);
    }

    expect(assets.fetch).toHaveBeenCalledTimes(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('proxies GET /v1/menu to the API origin with X-Forwarded-Host/-Proto set', async () => {
    const { env } = makeEnv();
    const ctx = makeCtx();
    fetchMock.mockResolvedValue(originJson({ tenant: 'pizza' }));

    const request = new Request('https://pizza.guest.invalid/v1/menu');
    await worker.fetch(request, env, ctx);
    await ctx.flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledRequest] = fetchMock.mock.calls[0] as [Request, unknown];
    expect(calledRequest.url).toBe(`${API_ORIGIN}/v1/menu`);
    expect(calledRequest.headers.get('X-Forwarded-Host')).toBe('pizza.guest.invalid');
    expect(calledRequest.headers.get('X-Forwarded-Proto')).toBe('https');
  });

  it('keys the cache on the incoming request URL, not the rewritten origin URL', async () => {
    const { env, cache } = makeEnv();
    const ctx = makeCtx();
    fetchMock.mockResolvedValue(originJson({ tenant: 'pizza' }));

    const request = new Request('https://pizza.guest.invalid/v1/menu');
    await worker.fetch(request, env, ctx);
    await ctx.flush();

    expect(cache.matchCalls[0]?.url).toBe('https://pizza.guest.invalid/v1/menu');
    expect(cache.putCalls[0]?.request.url).toBe('https://pizza.guest.invalid/v1/menu');
  });

  it('never leaks tenant content across tenants — a second tenant still calls the origin', async () => {
    const { env } = makeEnv();
    const ctx = makeCtx();
    fetchMock
      .mockResolvedValueOnce(originJson({ tenant: 'pizza' }))
      .mockResolvedValueOnce(originJson({ tenant: 'sushi' }));

    const pizzaResponse = await worker.fetch(
      new Request('https://pizza.guest.invalid/v1/menu'),
      env,
      ctx,
    );
    await ctx.flush();
    expect(await pizzaResponse.clone().json()).toEqual({ tenant: 'pizza' });

    const sushiResponse = await worker.fetch(
      new Request('https://sushi.guest.invalid/v1/menu'),
      env,
      ctx,
    );
    await ctx.flush();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await sushiResponse.clone().json()).toEqual({ tenant: 'sushi' });
  });

  it('opts the subrequest out of the zone cache', async () => {
    const { env } = makeEnv();
    const ctx = makeCtx();
    fetchMock.mockResolvedValue(originJson({ tenant: 'pizza' }));

    await worker.fetch(new Request('https://pizza.guest.invalid/v1/menu'), env, ctx);
    await ctx.flush();

    const [, init] = fetchMock.mock.calls[0] as [
      Request,
      { cf?: { cacheTtl?: number; cacheEverything?: boolean } },
    ];
    expect(init.cf).toEqual({ cacheTtl: 0, cacheEverything: false });
  });

  it('signals MISS then HIT on the same cacheable path, with exactly one origin call total', async () => {
    const { env } = makeEnv();
    const ctx = makeCtx();
    fetchMock.mockResolvedValue(originJson({ tenant: 'pizza' }));

    const first = await worker.fetch(new Request('https://pizza.guest.invalid/v1/menu'), env, ctx);
    await ctx.flush();
    expect(first.headers.get('X-Resto-Cache')).toBe('MISS');

    const second = await worker.fetch(new Request('https://pizza.guest.invalid/v1/menu'), env, ctx);
    await ctx.flush();
    expect(second.headers.get('X-Resto-Cache')).toBe('HIT');
    expect(await second.clone().json()).toEqual({ tenant: 'pizza' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('BYPASSes non-cacheable /v1/ paths', async () => {
    const { env } = makeEnv();
    const ctx = makeCtx();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 'abc' }), { status: 200 }));

    const response = await worker.fetch(
      new Request('https://pizza.guest.invalid/v1/orders/abc'),
      env,
      ctx,
    );
    await ctx.flush();

    expect(response.headers.get('X-Resto-Cache')).toBe('BYPASS');
  });

  it('does not share a cache entry between different location query params', async () => {
    const { env } = makeEnv();
    const ctx = makeCtx();
    fetchMock
      .mockResolvedValueOnce(originJson({ location: 'a' }))
      .mockResolvedValueOnce(originJson({ location: 'b' }));

    const a = await worker.fetch(
      new Request('https://pizza.guest.invalid/v1/menu?location=a'),
      env,
      ctx,
    );
    await ctx.flush();
    const b = await worker.fetch(
      new Request('https://pizza.guest.invalid/v1/menu?location=b'),
      env,
      ctx,
    );
    await ctx.flush();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await a.clone().json()).toEqual({ location: 'a' });
    expect(await b.clone().json()).toEqual({ location: 'b' });
  });

  it('proxies POST /v1/orders, never caches it, and returns BYPASS', async () => {
    const { env, cache } = makeEnv();
    const ctx = makeCtx();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ orderId: '1' }), { status: 201 }));

    const request = new Request('https://pizza.guest.invalid/v1/orders', {
      method: 'POST',
      body: JSON.stringify({ items: [] }),
      headers: { 'content-type': 'application/json' },
    });
    const response = await worker.fetch(request, env, ctx);
    await ctx.flush();

    expect(response.headers.get('X-Resto-Cache')).toBe('BYPASS');
    expect(cache.putCalls).toHaveLength(0);
  });

  it('returns an origin response carrying Set-Cookie but does not cache it', async () => {
    const { env, cache } = makeEnv();
    const ctx = makeCtx();
    fetchMock.mockResolvedValue(
      originJson({ tenant: 'pizza' }, { headers: { 'set-cookie': 'a=b' } }),
    );

    const response = await worker.fetch(
      new Request('https://pizza.guest.invalid/v1/menu'),
      env,
      ctx,
    );
    await ctx.flush();

    expect(response.headers.get('set-cookie')).toBe('a=b');
    expect(cache.putCalls).toHaveLength(0);
  });

  it('returns a 500 from the origin and does not cache it', async () => {
    const { env, cache } = makeEnv();
    const ctx = makeCtx();
    fetchMock.mockResolvedValue(new Response('boom', { status: 500 }));

    const response = await worker.fetch(
      new Request('https://pizza.guest.invalid/v1/menu'),
      env,
      ctx,
    );
    await ctx.flush();

    expect(response.status).toBe(500);
    expect(cache.putCalls).toHaveLength(0);
  });

  it('proxies GET /v1/orders/abc without touching the cache at all', async () => {
    const { env, cache } = makeEnv();
    const ctx = makeCtx();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 'abc' }), { status: 200 }));

    await worker.fetch(new Request('https://pizza.guest.invalid/v1/orders/abc'), env, ctx);
    await ctx.flush();

    expect(cache.matchCalls).toHaveLength(0);
    expect(cache.putCalls).toHaveLength(0);
  });
});
