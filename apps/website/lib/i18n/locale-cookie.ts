import 'server-only';
import { cookies, headers } from 'next/headers';
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, LOCALES, isLocale, type Locale } from './locales';

const negotiateFromAcceptLanguage = (header: string | null): Locale | null => {
  if (!header) return null;
  for (const token of header.split(',')) {
    const tag = token.split(';')[0]?.trim().toLowerCase() ?? '';
    if (tag.length === 0) continue;
    const primary = tag.split('-')[0] ?? '';
    if (isLocale(primary)) return primary;
    for (const known of LOCALES) {
      if (tag === known || tag.startsWith(`${known}-`)) return known;
    }
  }
  return null;
};

export const resolveLocale = async (): Promise<Locale> => {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  if (isLocale(fromCookie)) return fromCookie;

  const headersList = await headers();
  const negotiated = negotiateFromAcceptLanguage(headersList.get('accept-language'));
  return negotiated ?? DEFAULT_LOCALE;
};
