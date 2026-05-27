import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';

const SESSION_COOKIE = 'better-auth.session_token';

const makeReq = (path: string, cookies: Record<string, string> = {}): NextRequest => {
  const url = `http://localhost:3001${path}`;
  const cookie = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
  return new NextRequest(url, {
    headers: cookie ? { cookie } : {},
  });
};

describe('admin proxy', () => {
  it('redirects unauthenticated /dashboard requests to /login with `next` set', () => {
    const res = proxy(makeReq('/dashboard?tab=settings'));
    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/login');
    const u = new URL(location ?? '');
    expect(u.searchParams.get('next')).toBe('/dashboard?tab=settings');
  });

  it('passes /dashboard through when the BA session cookie is present', () => {
    const res = proxy(makeReq('/dashboard', { [SESSION_COOKIE]: 'fake-but-present' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('also accepts the `__Secure-` prefixed cookie name (production)', () => {
    const res = proxy(
      makeReq('/dashboard', { [`__Secure-${SESSION_COOKIE}`]: 'fake-but-present' }),
    );
    expect(res.status).toBe(200);
  });

  it('preserves query string when the path is safe (single-/ prefix)', () => {
    const res = proxy(makeReq('/onboarding/brand?welcome=1'));
    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    const u = new URL(location ?? '');
    expect(u.searchParams.get('next')).toBe('/onboarding/brand?welcome=1');
  });

  it('rejects protocol-relative `next=` paths via fallback to /dashboard (apps/CLAUDE.md open-redirect rule)', () => {
    // Build a request where pathname starts with `//` (protocol-relative
    // primitive an attacker could attempt via a crafted link or proxy
    // header). Construct via URL so `req.nextUrl.pathname` is `//evil.com/x`.
    const req = new NextRequest('http://localhost:3001//evil.com/x');
    const res = proxy(req);
    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    const u = new URL(location ?? '');
    expect(u.searchParams.get('next')).toBe('/dashboard');
    expect(u.searchParams.get('next')).not.toContain('//evil.com');
  });
});
