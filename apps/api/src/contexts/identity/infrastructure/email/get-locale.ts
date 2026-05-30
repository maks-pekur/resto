import { SUPPORTED_LOCALES, type EmailLocale } from '../../domain/email-locale';

const DEFAULT_LOCALE: EmailLocale = 'en';

const readAcceptLanguage = (
  headers: Record<string, string | string[] | undefined> | Headers | undefined,
): string | undefined => {
  if (!headers) return undefined;
  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get('accept-language') ?? undefined;
  }
  const raw = (headers as Record<string, string | string[] | undefined>)['accept-language'];
  if (Array.isArray(raw)) return raw[0];
  return raw;
};

const isSupported = (candidate: string): candidate is EmailLocale =>
  (SUPPORTED_LOCALES as readonly string[]).includes(candidate);

/**
 * D-03: derive an `EmailLocale` from an HTTP `Accept-Language` header.
 *
 * Resolution rules:
 *   - Take the first comma-separated segment ("primary preference").
 *   - Strip the `;q=…` quality suffix.
 *   - Lowercase, take the 2-char primary subtag (`ru-RU` → `ru`).
 *   - If supported, return it. Otherwise fallback to `'en'`.
 *
 * Works against both Fastify's plain `Record<string,...>` request.headers
 * and the WHATWG `Headers` instance handed in by Better Auth callbacks.
 *
 * Known limitation (CTO LOW-1): invitation sends originate from the
 * inviter's request — an EN-speaking admin inviting an RU-speaking new
 * operator sends an EN email. Per-user `locale` BA additionalField is
 * deferred to MVP-2.
 */
export const getLocale = (
  headers: Record<string, string | string[] | undefined> | Headers | undefined,
): EmailLocale => {
  const raw = readAcceptLanguage(headers);
  if (!raw) return DEFAULT_LOCALE;
  const firstSegment = raw.split(',')[0]?.trim();
  if (!firstSegment) return DEFAULT_LOCALE;
  const withoutQuality = firstSegment.split(';')[0]?.trim();
  if (!withoutQuality) return DEFAULT_LOCALE;
  const primarySubtag = withoutQuality.toLowerCase().split('-')[0];
  if (!primarySubtag) return DEFAULT_LOCALE;
  return isSupported(primarySubtag) ? primarySubtag : DEFAULT_LOCALE;
};
