import { CONTENT_LOCALES, type ContentLocale } from '@resto/domain';

export const CONTENT_LOCALE_FLAG: Record<ContentLocale, string> = {
  ru: '🇷🇺',
  en: '🇬🇧',
  uk: '🇺🇦',
  es: '🇪🇸',
};

export const contentLocaleOptions = (): readonly ContentLocale[] => CONTENT_LOCALES;

/** The operator picks languages for their guests, so the names are read in the operator's own. */
export const localeName = (locale: string, uiLanguage: string): string => {
  try {
    return new Intl.DisplayNames([uiLanguage], { type: 'language' }).of(locale) ?? locale;
  } catch {
    return locale;
  }
};
