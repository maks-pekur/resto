import { NextResponse, type NextRequest } from 'next/server';

/**
 * Next.js 16 proxy (renamed from middleware): protect operator routes
 * by redirecting unauthenticated requests to `/login`. Runtime is
 * nodejs — the check is cookie-only, no edge requirement.
 *
 * The check is **cookie presence only** — the api enforces real
 * authentication on every endpoint via the global AuthGuard. The
 * proxy exists so the browser never sees a flash of the dashboard
 * shell before the api 401s its first fetch. A cookie can be stale or
 * forged; that's fine, the api will reject it.
 *
 * Better Auth's default session cookie is `better-auth.session_token`,
 * with `__Secure-` prefix on https origins. We tolerate both so the
 * same proxy runs in dev and prod without env branching.
 */
const SESSION_COOKIE_NAMES = ['better-auth.session_token', '__Secure-better-auth.session_token'];

export function proxy(req: NextRequest): NextResponse {
  const hasSession = SESSION_COOKIE_NAMES.some((name) => req.cookies.has(name));
  if (hasSession) return NextResponse.next();

  const loginUrl = new URL('/login', req.url);
  const rawDest = `${req.nextUrl.pathname}${req.nextUrl.search}`;
  // apps/CLAUDE.md open-redirect rule: only same-origin paths beginning
  // with a single `/` (NOT `//` protocol-relative) survive; everything
  // else falls back to /dashboard.
  const safeDest = rawDest.startsWith('/') && !rawDest.startsWith('//') ? rawDest : '/dashboard';
  loginUrl.searchParams.set('next', safeDest);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/dashboard/:path*', '/onboarding/:path*'],
};
