import { useTranslation } from 'react-i18next';

/** Mirrors the fixed cell widths of `OrderRow`: change one, change the other. */
export function OrderFeedHeader() {
  const { t } = useTranslation('translation', { keyPrefix: 'orders.columns' });

  return (
    <div
      aria-hidden
      className="text-muted-foreground flex items-stretch px-1 text-xs font-medium tracking-wide uppercase"
    >
      <span className="w-20 shrink-0 px-2">{t('order')}</span>
      <span className="w-16 shrink-0 px-2 text-center">{t('remaining')}</span>
      <span className="w-20 shrink-0 px-3">{t('promised')}</span>
      <span className="hidden w-36 shrink-0 px-3 sm:block">{t('type')}</span>
      <span className="hidden min-w-0 flex-1 px-3 md:block">{t('for')}</span>
      <span className="w-24 shrink-0 px-2 text-center">{t('total')}</span>
    </div>
  );
}
