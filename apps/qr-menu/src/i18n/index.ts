import en from './en.json';
import ru from './ru.json';

const RESOURCES: Record<string, Record<string, string>> = { en, ru };

export type Locale = keyof typeof RESOURCES;

const detectLocale = (): Locale => {
  const candidates: string[] =
    typeof navigator !== 'undefined' ? [navigator.language, ...navigator.languages] : ['en'];
  for (const candidate of candidates) {
    const short = candidate.toLowerCase().split('-')[0];
    if (short && short in RESOURCES) {
      return short;
    }
  }
  return 'en';
};

let activeLocale: Locale = detectLocale();

/**
 * Translate a key with optional `{name}` interpolation. Falls back to
 * the English resource if the active locale is missing the key, then to
 * the key itself — a missing key is visible in the UI rather than
 * silently rendered blank.
 */
export const t = (key: string, replacements: Record<string, string | number> = {}): string => {
  const fromActive = RESOURCES[activeLocale]?.[key];
  const raw = fromActive ?? RESOURCES.en?.[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (_match, name: string) =>
    name in replacements ? String(replacements[name]) : `{${name}}`,
  );
};

export const setLocale = (locale: Locale): void => {
  activeLocale = locale;
};

export const getActiveLocale = (): Locale => activeLocale;

/**
 * Pick the best string from a `LocalizedText` map. Tries the active
 * locale, then English, then falls back to the first available value.
 */
export const localized = (text: Record<string, string> | null | undefined): string => {
  if (!text) return '';
  const exact = text[activeLocale];
  if (exact) return exact;
  if (text.en) return text.en;
  const first = Object.values(text)[0];
  return first ?? '';
};
