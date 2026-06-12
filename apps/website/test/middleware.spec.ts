import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { config } from '@/middleware';
import type { NextRequest, NextResponse } from 'next/server';

const buildRequest = (url: string, headers: Record<string, string> = {}): NextRequest => {
  const fullUrl = url.startsWith('http') ? url : `http://localhost:3002${url}`;
  const req = new Request(fullUrl, { headers });
  const parsedUrl = new URL(fullUrl);

  const rawCookieHeader = headers.cookie ?? '';
  const cookieMap = new Map<string, string>();
  if (rawCookieHeader) {
    for (const pair of rawCookieHeader.split(';')) {
      const eqIdx = pair.indexOf('=');
      if (eqIdx === -1) continue;
      const k = pair.slice(0, eqIdx).trim();
      const v = pair.slice(eqIdx + 1).trim();
      if (k) cookieMap.set(k, v);
    }
  }

  const cookies = {
    get: (name: string) => {
      const value = cookieMap.get(name);
      return value !== undefined ? { name, value } : undefined;
    },
  };

  return Object.assign(req, { nextUrl: parsedUrl, cookies }) as unknown as NextRequest;
};

const loadMiddleware = async () => {
  vi.resetModules();
  const mod = (await import('@/middleware')) as {
    middleware: (req: NextRequest) => NextResponse;
  };
  return mod.middleware;
};

describe('middleware', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  describe('tenant resolution — production security invariant', () => {
    it('PROD GUARD: ?tenant=evil query param yields NO x-tenant-slug when NODE_ENV=production', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      const prodMiddleware = await loadMiddleware();

      const req = buildRequest('/?tenant=evil', { host: 'localhost:3002' });
      const response = prodMiddleware(req);
      const slugHeader = response.headers.get('x-middleware-request-x-tenant-slug');
      expect(slugHeader).toBeNull();
    });
  });

  describe('tenant resolution — dev mode', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'development');
    });

    it('injects x-tenant-slug from ?tenant= query param in dev', async () => {
      const devMiddleware = await loadMiddleware();
      const req = buildRequest('/?tenant=demo', { host: 'localhost:3002' });
      const response = devMiddleware(req);
      expect(response.headers.get('x-middleware-request-x-tenant-slug')).toBe('demo');
    });
  });

  describe('tenant resolution — subdomain / custom domain', () => {
    let mw: Awaited<ReturnType<typeof loadMiddleware>>;

    beforeEach(async () => {
      mw = await loadMiddleware();
    });

    it('extracts subdomain slug from 3-label hostname (acme.resto.app → acme)', () => {
      const req = buildRequest('/', { host: 'acme.resto.app' });
      const response = mw(req);
      expect(response.headers.get('x-middleware-request-x-tenant-slug')).toBe('acme');
    });

    it('does NOT extract slug for www subdomain (www.resto.app → no slug)', () => {
      const req = buildRequest('/', { host: 'www.resto.app' });
      const response = mw(req);
      expect(response.headers.get('x-middleware-request-x-tenant-slug')).toBeNull();
    });

    it('forwards full hostname for 2-label custom domain (restaurant.com → restaurant.com)', () => {
      const req = buildRequest('http://restaurant.com/', { host: 'restaurant.com' });
      const response = mw(req);
      expect(response.headers.get('x-middleware-request-x-tenant-slug')).toBe('restaurant.com');
    });

    it('yields no x-tenant-slug when host has no labels beyond bare localhost', () => {
      const req = buildRequest('http://localhost:3002/', { host: 'localhost' });
      const response = mw(req);
      expect(response.headers.get('x-middleware-request-x-tenant-slug')).toBeNull();
    });
  });

  describe('locale resolution', () => {
    let mw: Awaited<ReturnType<typeof loadMiddleware>>;

    beforeEach(async () => {
      mw = await loadMiddleware();
    });

    it('falls back to en when no cookie or accept-language present', () => {
      const req = buildRequest('/', { host: 'acme.resto.app' });
      const response = mw(req);
      const localeCookie = response.cookies.get('NEXT_LOCALE');
      expect(localeCookie?.value).toBe('en');
    });

    it('uses valid resto.locale cookie locale', () => {
      const req = buildRequest('/', {
        host: 'acme.resto.app',
        cookie: 'resto.locale=uk',
      });
      const response = mw(req);
      expect(response.cookies.get('NEXT_LOCALE')?.value).toBe('uk');
    });

    it('negotiates locale from accept-language header', () => {
      const req = buildRequest('/', {
        host: 'acme.resto.app',
        'accept-language': 'uk-UA,uk;q=0.9,en;q=0.8',
      });
      const response = mw(req);
      expect(response.cookies.get('NEXT_LOCALE')?.value).toBe('uk');
    });

    it('falls back to en when accept-language has only unsupported locales', () => {
      const req = buildRequest('/', {
        host: 'acme.resto.app',
        'accept-language': 'fr-FR,fr;q=0.9',
      });
      const response = mw(req);
      expect(response.cookies.get('NEXT_LOCALE')?.value).toBe('en');
    });
  });

  describe('config matcher', () => {
    it('exports a config.matcher array that excludes _next/static', () => {
      expect(Array.isArray(config.matcher)).toBe(true);
      expect(config.matcher.length).toBeGreaterThan(0);
      const pattern = config.matcher[0] ?? '';
      expect(pattern).toContain('_next/static');
    });
  });
});
