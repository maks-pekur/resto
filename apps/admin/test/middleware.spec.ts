import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

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

describe('admin middleware', () => {
  it('redirects unauthenticated /dashboard requests to /login with `next` set', () => {
    const res = middleware(makeReq('/dashboard?tab=settings'));
    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/login');
    const u = new URL(location ?? '');
    expect(u.searchParams.get('next')).toBe('/dashboard?tab=settings');
  });

  it('passes /dashboard through when the BA session cookie is present', () => {
    const res = middleware(makeReq('/dashboard', { [SESSION_COOKIE]: 'fake-but-present' }));
    // NextResponse.next() returns 200 with a custom internal header.
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('also accepts the `__Secure-` prefixed cookie name (production)', () => {
    const res = middleware(
      makeReq('/dashboard', { [`__Secure-${SESSION_COOKIE}`]: 'fake-but-present' }),
    );
    expect(res.status).toBe(200);
  });
});
