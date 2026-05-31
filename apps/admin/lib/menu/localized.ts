/**
 * LocalizedText boundary helpers (RESEARCH.md Pitfall #9, Open Question #1).
 *
 * The api persists `LocalizedText` as `{ [locale: string]: string }`. The
 * admin UI is single-locale Russian for MVP-1 (D-05), so we pin a
 * `DEFAULT_LOCALE` constant here and lift plain strings into / out of the
 * api shape at the network boundary. Multilingual editor + per-tenant
 * default-locale lookup is deferred to v2.
 */

export const DEFAULT_LOCALE = 'ru' as const;

export type LocalizedText = Record<string, string>;

export const toLocalizedText = (plain: string, locale: string = DEFAULT_LOCALE): LocalizedText => ({
  [locale]: plain,
});

export const fromLocalizedText = (
  value: LocalizedText | undefined | null,
  locale: string = DEFAULT_LOCALE,
): string => {
  if (!value) return '';
  const exact = value[locale];
  if (typeof exact === 'string' && exact.length > 0) return exact;
  const en = value.en;
  if (typeof en === 'string' && en.length > 0) return en;
  for (const v of Object.values(value)) {
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return '';
};
