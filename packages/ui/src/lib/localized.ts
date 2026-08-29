import type { LocalizedText } from '@resto/api-client/public';

export const localized = (text: LocalizedText | null | undefined, locale: string): string => {
  if (!text) return '';
  return text[locale] ?? text.en ?? Object.values(text)[0] ?? '';
};
