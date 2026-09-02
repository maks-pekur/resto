'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '../lib/utils';
import { useGuestUi } from './guest-ui-provider';

const LOCALE_FLAG: Record<string, string> = {
  ru: '🇷🇺',
  en: '🇬🇧',
  es: '🇪🇸',
  uk: '🇺🇦',
};

/** Each language named in itself, which is what a guest scanning the list looks for. */
const endonym = (locale: string): string => {
  try {
    return new Intl.DisplayNames([locale], { type: 'language' }).of(locale) ?? locale;
  } catch {
    return locale;
  }
};

interface DiscProps {
  readonly locale: string;
  readonly withCode: boolean;
}

function LocaleDisc({ locale, withCode }: DiscProps) {
  const flag = LOCALE_FLAG[locale];
  return (
    <span className="relative inline-flex shrink-0">
      <span className="ring-border bg-muted grid size-8 place-items-center overflow-hidden rounded-full text-base leading-none ring-1 xs:size-9 xs:text-lg">
        {flag ?? <span className="text-xs font-bold uppercase">{locale}</span>}
      </span>
      {withCode && flag !== undefined ? (
        <span className="bg-primary text-primary-foreground border-background absolute -end-1 -bottom-1 rounded-full border px-1 text-[9px] leading-[1.3] font-bold uppercase">
          {locale}
        </span>
      ) : null}
    </span>
  );
}

export interface LocaleSwitcherProps {
  readonly locales: readonly string[];
  readonly activeLocale: string;
  readonly onSelect: (locale: string) => void;
  readonly className?: string;
}

/**
 * The same control the operator panel uses: a flag on the trigger, the choice behind it. Written
 * without a menu library on purpose — the guest bundle is opened on a phone over mobile data,
 * and a popover dependency is not worth two clicks.
 */
export const LocaleSwitcher = ({
  locales,
  activeLocale,
  onSelect,
  className,
}: LocaleSwitcherProps) => {
  const { t } = useGuestUi();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | TouchEvent): void => {
      if (rootRef.current?.contains(event.target as Node) === false) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (locales.length < 2) return null;

  return (
    <div ref={rootRef} className={cn('relative inline-flex', className)}>
      <button
        type="button"
        aria-label={t('locale.label')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((prev) => !prev);
        }}
        className="focus-visible:ring-ring flex size-10 cursor-pointer items-center justify-center rounded-full transition focus-visible:ring-2 focus-visible:outline-none xs:size-11 sm:size-10"
      >
        <LocaleDisc locale={activeLocale} withCode={false} />
      </button>

      {open ? (
        <div
          role="menu"
          className="bg-popover text-popover-foreground absolute end-0 top-full z-50 mt-2 w-auto rounded-md border p-1 shadow-md"
        >
          {locales.map((locale) => {
            const isActive = locale === activeLocale;
            return (
              <button
                key={locale}
                type="button"
                role="menuitem"
                aria-current={isActive ? 'true' : undefined}
                aria-label={endonym(locale)}
                onClick={() => {
                  setOpen(false);
                  if (!isActive) onSelect(locale);
                }}
                className={cn(
                  'hover:bg-accent hover:text-accent-foreground flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-start text-sm',
                  isActive && 'text-primary font-semibold',
                )}
              >
                <LocaleDisc locale={locale} withCode={false} />
                {/* The code, not the language's name: the flag already says which one it is. */}
                <span aria-hidden className="text-xs font-semibold uppercase">
                  {locale}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};
