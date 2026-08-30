import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { formatMoney } from '@/lib/format/money';

/**
 * The formatter every screen should use: it carries the operator's language, so the same amount
 * reads as `1 200,00 €` for a Russian operator and `€1,200.00` for an English one.
 */
export const useMoney = (): ((amount: string | number, currency: string) => string) => {
  const { i18n } = useTranslation();

  return useCallback(
    (amount: string | number, currency: string) => formatMoney(amount, currency, i18n.language),
    [i18n.language],
  );
};
