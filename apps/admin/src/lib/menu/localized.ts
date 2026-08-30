export const DEFAULT_LOCALE = 'ru' as const;

export type LocalizedText = Record<string, string>;

/** Writing one language must not erase the others already stored on the record. */
export const mergeLocalized = (
  base: LocalizedText | null | undefined,
  locale: string,
  text: string,
): LocalizedText => ({ ...(base ?? {}), [locale]: text });

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
