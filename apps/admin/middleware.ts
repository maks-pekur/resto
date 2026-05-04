import { NextResponse, type NextRequest } from 'next/server';

/**
 * Edge middleware: protect operator routes by redirecting
 * unauthenticated requests to `/login`.
 *
 * The check is **cookie presence only** — the api enforces real
 * authentication on every endpoint via the global AuthGuard. The
 * middleware exists so the browser never sees a flash of the dashboard
 * shell before the api 401s its first fetch. A cookie can be stale or
 * forged; that's fine, the api will reject it.
 *
 * Better Auth's default session cookie is `better-auth.session_token`,
 * with `__Secure-` prefix on https origins. We tolerate both so the
 * same middleware runs in dev and prod without env branching.
 */
const SESSION_COOKIE_NAMES = ['better-auth.session_token', '__Secure-better-auth.session_token'];

export function middleware(req: NextRequest): NextResponse {
  const hasSession = SESSION_COOKIE_NAMES.some((name) => req.cookies.has(name));
  if (hasSession) return NextResponse.next();

  const loginUrl = new URL('/login', req.url);
  // Round-trip back to the original target after the user signs in.
  const dest = `${req.nextUrl.pathname}${req.nextUrl.search}`;
  loginUrl.searchParams.set('next', dest);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  /*
   * Match the operator surface only. `/login` and the BA endpoints at
   * `/api/auth/*` (proxied to the api) MUST stay outside this guard,
   * otherwise sign-in is impossible.
   */
  matcher: ['/dashboard/:path*'],
};
