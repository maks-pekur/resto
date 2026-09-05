export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  API_ORIGIN: string;
}

declare global {
  interface CacheStorage {
    readonly default: Cache;
  }
}

interface CfFetchInit extends RequestInit {
  cf?: { cacheTtl: number; cacheEverything: boolean };
}

const isCacheableMenuPath = (pathname: string): boolean =>
  pathname === '/v1/menu' ||
  pathname === '/v1/menu/availability' ||
  pathname.startsWith('/v1/menu/items/');

const withCacheSignal = (response: Response, signal: 'HIT' | 'MISS' | 'BYPASS'): Response => {
  const tagged = new Response(response.body, response);
  tagged.headers.set('X-Resto-Cache', signal);
  return tagged;
};

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: { waitUntil(promise: Promise<unknown>): void },
  ): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/v1/')) {
      return env.ASSETS.fetch(request);
    }

    const cache = caches.default;
    const cacheable = request.method === 'GET' && isCacheableMenuPath(url.pathname);

    const cacheKey = new Request(url.toString(), request);

    if (cacheable) {
      const cached = await cache.match(cacheKey);
      if (cached) return withCacheSignal(cached, 'HIT');
    }

    const originUrl = new URL(url.pathname + url.search, env.API_ORIGIN);
    const originRequest = new Request(originUrl, request);
    originRequest.headers.set('X-Forwarded-Host', url.hostname);
    originRequest.headers.set('X-Forwarded-Proto', 'https');

    // This subrequest is tenant-blind (env.API_ORIGIN is identical for every tenant) and
    // must never be cached at the api.<apex> zone ahead of the tenant-keyed entry above.
    const originInit: CfFetchInit = { cf: { cacheTtl: 0, cacheEverything: false } };
    const originResponse = await fetch(originRequest, originInit);

    const response = withCacheSignal(originResponse, cacheable ? 'MISS' : 'BYPASS');

    if (cacheable && originResponse.ok && !originResponse.headers.has('Set-Cookie')) {
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }

    return response;
  },
};
