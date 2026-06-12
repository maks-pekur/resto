import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, isLocale, type Locale } from '@/lib/i18n/locales';

const DEV_TENANT_PARAM = 'tenant';

const negotiateFromAcceptLanguage = (header: string | null): Locale | null => {
  if (!header) return null;
  for (const token of header.split(',')) {
    const tag = token.split(';')[0]?.trim().toLowerCase() ?? '';
    if (tag.length === 0) continue;
    const primary = tag.split('-')[0] ?? '';
    if (isLocale(primary)) return primary;
  }
  return null;
};

export function middleware(request: NextRequest): NextResponse {
  const url = request.nextUrl;
  const host = request.headers.get('host') ?? '';

  const requestHeaders = new Headers(request.headers);

  let tenantSlug: string | null = null;

  if (process.env.NODE_ENV !== 'production') {
    tenantSlug = url.searchParams.get(DEV_TENANT_PARAM);
  }

  if (!tenantSlug) {
    const hostname = host.split(':')[0] ?? '';
    const labels = hostname.split('.');
    if (labels.length >= 3 && labels[0] && labels[0] !== 'www') {
      tenantSlug = labels[0];
    } else if (labels.length === 2) {
      tenantSlug = hostname;
    }
  }

  if (tenantSlug) {
    requestHeaders.set('x-tenant-slug', tenantSlug);
  }

  const fromCookie = request.cookies.get(LOCALE_COOKIE_NAME)?.value;
  const locale: Locale = isLocale(fromCookie)
    ? fromCookie
    : (negotiateFromAcceptLanguage(request.headers.get('accept-language')) ?? DEFAULT_LOCALE);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  response.cookies.set('NEXT_LOCALE', locale, {
    path: '/',
    sameSite: 'lax',
    httpOnly: false,
  });

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
