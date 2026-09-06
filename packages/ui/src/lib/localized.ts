import type { LocalizedText } from '@resto/api-client/public';

/**
 * Pick the string a guest should read. The tenant's own default comes before English: a
 * Ukrainian restaurant that never wrote an English name should show the Ukrainian one, not
 * whichever key happened to be first in the object.
 */
export const localized = (
  text: LocalizedText | null | undefined,
  locale: string,
  defaultLocale?: string,
): string => {
  if (!text) return '';
  if (text[locale]) return text[locale];
  if (defaultLocale !== undefined && text[defaultLocale]) return text[defaultLocale];
  return text.en ?? Object.values(text)[0] ?? '';
};
