export const localized = (
  text: Record<string, string> | null | undefined,
  locale: string,
): string => {
  if (!text) return '';
  const exact = text[locale];
  if (exact) return exact;
  const en = text.en;
  if (en) return en;
  const first = Object.values(text)[0];
  return first ?? '';
};
