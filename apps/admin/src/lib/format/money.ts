const FRACTIONLESS_CURRENCIES = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK']);

const toNumber = (amount: string | number): number =>
  typeof amount === 'string' ? Number(amount) : amount;

/**
 * Money crosses the wire as a decimal string and must never become a float before it is read —
 * this is the last step, where a value already decided is turned into something a person reads.
 * The locale is the operator's, not the tenant's: the currency says what the money is, the
 * locale only says how the reader expects digits grouped.
 */
export const formatMoney = (
  amount: string | number,
  currency: string,
  locale = 'ru-RU',
): string => {
  const value = toNumber(amount);
  if (!Number.isFinite(value)) return '—';

  const fractionDigits = FRACTIONLESS_CURRENCIES.has(currency.toUpperCase()) ? 0 : 2;

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      // Without this a locale that has no symbol of its own for the currency prints the ISO
      // code — "1 200,00 UAH" where the operator expects "1 200,00 ₴".
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(value);
  } catch {
    // An unknown currency code throws rather than degrading; the number is still worth showing.
    return `${value.toFixed(fractionDigits)} ${currency}`;
  }
};
