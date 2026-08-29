const formatters = new Map<string, Intl.NumberFormat>();

const formatterFor = (
  locale: string,
  currency: string,
  fractionDigits: number,
): Intl.NumberFormat | null => {
  const key = `${locale}:${currency}:${fractionDigits.toString()}`;
  const cached = formatters.get(key);
  if (cached) return cached;
  try {
    const formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    formatters.set(key, formatter);
    return formatter;
  } catch {
    return null;
  }
};

/** Amounts cross the wire as decimal strings; an unknown currency code or a
 * non-numeric amount must still render something rather than throw. Whole
 * amounts drop the `.00` the way a menu board prints them. */
export const formatPrice = (amount: string, currency: string, locale: string): string => {
  const value = Number(amount);
  if (!Number.isFinite(value)) return `${amount} ${currency}`;
  const formatter = formatterFor(locale, currency, Number.isInteger(value) ? 0 : 2);
  return formatter ? formatter.format(value) : `${amount} ${currency}`;
};
