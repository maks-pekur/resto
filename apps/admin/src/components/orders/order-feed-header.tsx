import { useTranslation } from 'react-i18next';

/** Mirrors the fixed cell widths of `OrderRow`: change one, change the other. */
export function OrderFeedHeader() {
  const { t } = useTranslation('translation', { keyPrefix: 'orders.columns' });

  return (
    <div
      aria-hidden
      className="bg-muted/50 text-muted-foreground flex min-h-9 items-stretch divide-x overflow-hidden rounded-md border text-xs font-medium tracking-wide uppercase"
    >
      <span className="flex w-20 shrink-0 items-center justify-center px-2">{t('order')}</span>
      <span className="flex w-16 shrink-0 items-center justify-center px-2">{t('remaining')}</span>
      <span className="flex w-20 shrink-0 items-center px-3">{t('promised')}</span>
      <span className="hidden w-36 shrink-0 items-center px-3 sm:flex">{t('type')}</span>
      <span className="hidden min-w-0 flex-1 items-center px-3 md:flex">{t('for')}</span>
      <span className="flex w-24 shrink-0 items-center justify-center px-2">{t('total')}</span>
    </div>
  );
}
