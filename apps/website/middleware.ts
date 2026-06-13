import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, isLocale, type Locale } from '@/lib/i18n/locales';

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
  const fromCookie = request.cookies.get(LOCALE_COOKIE_NAME)?.value;
  const locale: Locale = isLocale(fromCookie)
    ? fromCookie
    : (negotiateFromAcceptLanguage(request.headers.get('accept-language')) ?? DEFAULT_LOCALE);

  const response = NextResponse.next();
  response.cookies.set('NEXT_LOCALE', locale, { path: '/', sameSite: 'lax', httpOnly: false });
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
