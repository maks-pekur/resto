'use client';

import { cn } from '../lib/utils';
import { useGuestUi } from './guest-ui-provider';

export interface LocaleSwitcherProps {
  readonly locales: readonly string[];
  readonly activeLocale: string;
  readonly onSelect: (locale: string) => void;
  readonly className?: string;
}

export const LocaleSwitcher = ({
  locales,
  activeLocale,
  onSelect,
  className,
}: LocaleSwitcherProps) => {
  const { t } = useGuestUi();

  if (locales.length < 2) return null;

  return (
    <div
      role="group"
      aria-label={t('locale.label')}
      className={cn('bg-muted inline-flex items-center rounded-full p-0.5', className)}
    >
      {locales.map((locale) => {
        const isActive = locale === activeLocale;
        return (
          <button
            key={locale}
            type="button"
            aria-current={isActive ? 'true' : undefined}
            onClick={() => {
              onSelect(locale);
            }}
            className={cn(
              'focus-visible:ring-ring cursor-pointer rounded-full px-3 py-1.5 text-xs font-bold uppercase transition-colors focus-visible:ring-2 focus-visible:outline-none',
              isActive
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {locale}
          </button>
        );
      })}
    </div>
  );
};
