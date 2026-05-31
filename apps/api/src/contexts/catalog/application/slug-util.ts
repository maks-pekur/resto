import { slugify } from 'transliteration';

/**
 * D-4a-04 / RESEARCH.md Pattern 4: derive a URL-safe slug from arbitrary
 * (potentially Cyrillic/CJK) localized name.
 *
 * Chain: `transliteration.slugify` (lowercase, kebab, trim) → strip any
 * residual non-`[a-z0-9-]` chars → collapse repeat dashes → trim edge
 * dashes. Output matches the DB CHECK `^[a-z0-9][a-z0-9-]*$` enforced on
 * `menu_items.slug` and `menu_categories.slug`.
 *
 * If transliteration yields an empty string (e.g. all input was unknown
 * Unicode), the result is the empty string — caller decides whether to
 * fall back (typically an HTTP 400). The DB CHECK will reject `''` anyway.
 */
export const normalizeSlug = (input: string): string => {
  const transliterated = slugify(input, {
    lowercase: true,
    separator: '-',
    trim: true,
  });
  return transliterated
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

/**
 * Pick a representative locale value from a LocalizedText record for slug
 * derivation. LocalizedText has no built-in "default locale"; the priority
 * here matches the project's primary market (`ru`) then fallback to `en`
 * then the first available locale key.
 */
export const pickDefaultLocaleValue = (name: Record<string, string>): string => {
  if (typeof name.ru === 'string' && name.ru.length > 0) return name.ru;
  if (typeof name.en === 'string' && name.en.length > 0) return name.en;
  for (const value of Object.values(name)) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return '';
};

export const deriveSlugFromName = (name: Record<string, string>): string =>
  normalizeSlug(pickDefaultLocaleValue(name));
