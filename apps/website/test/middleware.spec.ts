import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { middleware, config } from '@/middleware';
import type { NextRequest } from 'next/server';

const buildRequest = (url: string, headers: Record<string, string> = {}): NextRequest => {
  const fullUrl = url.startsWith('http') ? url : `http://localhost:3002${url}`;
  return new Request(fullUrl, { headers }) as unknown as NextRequest;
};

describe('middleware', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: originalNodeEnv,
      writable: true,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  describe('tenant resolution — production security invariant', () => {
    it('PROD GUARD: ?tenant=evil query param yields NO x-tenant-slug when NODE_ENV=production', () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'production',
        writable: true,
        configurable: true,
      });

      const req = buildRequest('/?tenant=evil', { host: 'localhost:3002' });
      const response = middleware(req);
      const slugHeader = response.headers.get('x-tenant-slug');
      expect(slugHeader).toBeNull();
    });
  });

  describe('tenant resolution — dev mode', () => {
    beforeEach(() => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'development',
        writable: true,
        configurable: true,
      });
    });

    it('injects x-tenant-slug from ?tenant= query param in dev', () => {
      const req = buildRequest('/?tenant=demo', { host: 'localhost:3002' });
      const response = middleware(req);
      expect(response.headers.get('x-tenant-slug')).toBe('demo');
    });
  });

  describe('tenant resolution — subdomain / custom domain', () => {
    it('extracts subdomain slug from 3-label hostname (acme.resto.app → acme)', () => {
      const req = buildRequest('/', { host: 'acme.resto.app' });
      const response = middleware(req);
      expect(response.headers.get('x-tenant-slug')).toBe('acme');
    });

    it('does NOT extract slug for www subdomain (www.resto.app → no slug)', () => {
      const req = buildRequest('/', { host: 'www.resto.app' });
      const response = middleware(req);
      expect(response.headers.get('x-tenant-slug')).toBeNull();
    });

    it('forwards full hostname for 2-label custom domain (restaurant.com → restaurant.com)', () => {
      const req = buildRequest('/', { host: 'restaurant.com' });
      const response = middleware(req);
      expect(response.headers.get('x-tenant-slug')).toBe('restaurant.com');
    });

    it('yields no x-tenant-slug when host has no labels beyond bare localhost', () => {
      const req = buildRequest('http://localhost:3002/');
      const response = middleware(req);
      expect(response.headers.get('x-tenant-slug')).toBeNull();
    });
  });

  describe('locale resolution', () => {
    it('falls back to en when no cookie or accept-language present', () => {
      const req = buildRequest('/', { host: 'acme.resto.app' });
      const response = middleware(req);
      const localeCookie = response.cookies.get('NEXT_LOCALE');
      expect(localeCookie?.value).toBe('en');
    });

    it('uses valid resto.locale cookie locale', () => {
      const req = buildRequest('/', {
        host: 'acme.resto.app',
        cookie: 'resto.locale=uk',
      });
      const response = middleware(req);
      expect(response.cookies.get('NEXT_LOCALE')?.value).toBe('uk');
    });

    it('negotiates locale from accept-language header', () => {
      const req = buildRequest('/', {
        host: 'acme.resto.app',
        'accept-language': 'uk-UA,uk;q=0.9,en;q=0.8',
      });
      const response = middleware(req);
      expect(response.cookies.get('NEXT_LOCALE')?.value).toBe('uk');
    });

    it('falls back to en when accept-language has only unsupported locales', () => {
      const req = buildRequest('/', {
        host: 'acme.resto.app',
        'accept-language': 'fr-FR,fr;q=0.9',
      });
      const response = middleware(req);
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
