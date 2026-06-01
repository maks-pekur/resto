export const LOCALES = ['ru', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'ru';

export const isLocale = (value: string | undefined): value is Locale =>
  value !== undefined && (LOCALES as readonly string[]).includes(value);

export const LOCALE_COOKIE_NAME = 'resto.locale';
