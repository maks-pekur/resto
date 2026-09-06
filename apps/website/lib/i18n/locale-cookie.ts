import 'server-only';
import { cookies, headers } from 'next/headers';
import { fetchMenuPublic } from '../api-client';
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, LOCALES, isLocale, type Locale } from './locales';

export const negotiateFromAcceptLanguage = (
  header: string | null,
  offered: readonly Locale[],
): Locale | null => {
  if (!header) return null;
  for (const token of header.split(',')) {
    const tag = token.split(';')[0]?.trim().toLowerCase() ?? '';
    if (tag.length === 0) continue;
    const primary = tag.split('-')[0] ?? '';
    const direct = offered.find((known) => known === primary);
    if (direct) return direct;
    const prefixed = offered.find((known) => tag === known || tag.startsWith(`${known}-`));
    if (prefixed) return prefixed;
  }
  return null;
};

/** What the restaurant publishes in, narrowed to what this site has chrome translations for. */
const tenantLocales = async (): Promise<{ offered: Locale[]; fallback: Locale }> => {
  try {
    const menu = await fetchMenuPublic();
    const locales = menu.tenant?.locales;
    if (!locales) return { offered: [...LOCALES], fallback: DEFAULT_LOCALE };
    const offered = locales.supported.filter(isLocale);
    const fallback = isLocale(locales.default) ? locales.default : DEFAULT_LOCALE;
    return offered.length > 0 ? { offered, fallback } : { offered: [fallback], fallback };
  } catch {
    // Unresolved host or a cold cache must not decide the language for the whole site.
    return { offered: [...LOCALES], fallback: DEFAULT_LOCALE };
  }
};

export const resolveLocale = async (): Promise<Locale> => {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  const { offered, fallback } = await tenantLocales();
  // A guest's own choice wins, but only while the restaurant still publishes in it.
  if (isLocale(fromCookie) && offered.includes(fromCookie)) return fromCookie;

  const headersList = await headers();
  return negotiateFromAcceptLanguage(headersList.get('accept-language'), offered) ?? fallback;
};
