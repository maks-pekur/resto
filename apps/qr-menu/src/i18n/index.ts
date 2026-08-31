import en from './en.json';
import es from './es.json';
import ru from './ru.json';
import uk from './uk.json';

// Every language a restaurant may publish its menu in: the chrome has to follow the dish names,
// or a guest reading a Spanish menu presses an English button.
const RESOURCES: Record<string, Record<string, string>> = { en, es, ru, uk };

export type Locale = keyof typeof RESOURCES;

const browserCandidates = (): string[] => {
  const raw =
    typeof navigator !== 'undefined' ? [navigator.language, ...navigator.languages] : ['en'];
  return raw.map((candidate) => candidate.toLowerCase().split('-')[0] ?? '').filter(Boolean);
};

/** A language the guest picked themselves — it outranks anything the restaurant or browser says. */
const readChoice = (): string | null => {
  if (typeof window === 'undefined') return null;
  const fromPath = /^\/([a-z]{2})(?:\/|$)/.exec(window.location.pathname)?.[1];
  if (fromPath) return fromPath;
  return /(?:^|;\s*)locale=([a-z]{2})/.exec(document.cookie)?.[1] ?? null;
};

let chosenLocale: string | null = readChoice();
let activeLocale: string =
  chosenLocale ?? browserCandidates().find((candidate) => candidate in RESOURCES) ?? 'en';

/**
 * The menu says which languages the restaurant actually publishes in. Until it arrives all we have
 * is the browser, which is why a Russian-only menu could open in English: `en` is where the guess
 * lands, and the guess was never revisited.
 */
export const adoptTenantLocales = (
  supported: readonly string[],
  defaultLocale: string,
): boolean => {
  if (chosenLocale !== null && supported.includes(chosenLocale)) return false;
  const next =
    browserCandidates().find((candidate) => supported.includes(candidate)) ?? defaultLocale;
  if (next === activeLocale) return false;
  activeLocale = next;
  return true;
};

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

export const setLocale = (locale: string): void => {
  chosenLocale = locale;
  activeLocale = locale;
};

export const getActiveLocale = (): string => activeLocale;

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
