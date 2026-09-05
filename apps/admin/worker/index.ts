export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  API_ORIGIN: string;
}

interface CfFetchInit extends RequestInit {
  cf?: { cacheTtl: number; cacheEverything: boolean };
}

const isProxiedPath = (pathname: string): boolean =>
  pathname.startsWith('/v1/') || pathname.startsWith('/api/');

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!isProxiedPath(url.pathname)) {
      return env.ASSETS.fetch(request);
    }

    const originUrl = new URL(url.pathname + url.search, env.API_ORIGIN);
    const originRequest = new Request(originUrl, request);
    originRequest.headers.set('X-Forwarded-Host', url.hostname);
    originRequest.headers.set('X-Forwarded-Proto', 'https');

    const originInit: CfFetchInit = { cf: { cacheTtl: 0, cacheEverything: false } };
    const originResponse = await fetch(originRequest, originInit);

    const response = new Response(originResponse.body, originResponse);
    response.headers.set('X-Resto-Cache', 'BYPASS');
    return response;
  },
};
