'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, Globe } from 'lucide-react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { setLocaleAction } from '@/lib/i18n/set-locale-action';
import { LOCALES, type Locale } from '@/lib/i18n/locales';

const LABEL_KEY: Record<Locale, 'localeRu' | 'localeEn'> = {
  ru: 'localeRu',
  en: 'localeEn',
};

export function LocaleSwitcherItems(): React.ReactElement {
  const active = useLocale();
  const t = useTranslations('nav.user');
  const [, startTransition] = React.useTransition();
  return (
    <>
      {LOCALES.map((locale, idx) => {
        const isActive = locale === active;
        return (
          <DropdownMenuItem
            key={locale}
            onClick={() => {
              if (isActive) return;
              startTransition(async () => {
                await setLocaleAction(locale);
              });
            }}
            data-testid={`locale-${locale}`}
          >
            {idx === 0 ? <Globe /> : <span className="size-4" aria-hidden="true" />}
            <span className="flex-1">{t(LABEL_KEY[locale])}</span>
            {isActive ? <Check className="size-4" aria-hidden="true" /> : null}
          </DropdownMenuItem>
        );
      })}
    </>
  );
}
