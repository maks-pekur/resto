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

    it('does not inject x-tenant-slug for any host', () => {
      const req = buildRequest('/', { host: 'acme.resto.app' });
      const response = mw(req);
      expect(response.headers.get('x-middleware-request-x-tenant-slug')).toBeNull();
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
