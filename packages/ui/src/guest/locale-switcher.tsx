'use client';

import { cn } from '../lib/utils';
import { useGuestUi } from './guest-ui-provider';

const LOCALE_FLAG: Record<string, string> = {
  ru: '🇷🇺',
  en: '🇬🇧',
  es: '🇪🇸',
  uk: '🇺🇦',
};

export interface LocaleSwitcherProps {
  readonly locales: readonly string[];
  readonly activeLocale: string;
  readonly onSelect: (locale: string) => void;
  readonly className?: string;
}

/**
 * Flag discs with the code on them: a guest picks their language by recognising it, not by
 * reading it. A locale we have no flag for keeps the code alone rather than borrowing someone
 * else's — a wrong flag reads as a wrong country.
 */
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
      className={cn('inline-flex items-center gap-1.5', className)}
    >
      {locales.map((locale) => {
        const isActive = locale === activeLocale;
        const flag = LOCALE_FLAG[locale];
        return (
          <button
            key={locale}
            type="button"
            aria-current={isActive ? 'true' : undefined}
            onClick={() => {
              onSelect(locale);
            }}
            className={cn(
              'focus-visible:ring-ring relative flex min-h-11 cursor-pointer items-center justify-center rounded-full transition focus-visible:ring-2 focus-visible:outline-none sm:min-h-8',
              isActive ? 'opacity-100' : 'opacity-60 hover:opacity-100',
            )}
          >
            <span
              className={cn(
                'bg-muted grid size-7 place-items-center overflow-hidden rounded-full text-base leading-none ring-1',
                isActive ? 'ring-primary ring-2' : 'ring-border',
              )}
            >
              {flag ?? <span className="text-[10px] font-bold uppercase">{locale}</span>}
            </span>
            {flag === undefined ? null : (
              <span className="bg-primary text-primary-foreground border-background absolute -right-1 bottom-0 rounded-full border px-1 text-[9px] leading-[1.3] font-bold uppercase sm:-bottom-1">
                {locale}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
