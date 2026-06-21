import * as React from 'react';
import { Check, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';

const LOCALES = ['ru', 'en'] as const;
type Locale = (typeof LOCALES)[number];

const LABEL_KEY: Record<Locale, 'localeRu' | 'localeEn'> = {
  ru: 'localeRu',
  en: 'localeEn',
};

export function LocaleSwitcherItems(): React.ReactElement {
  const { t, i18n } = useTranslation('translation', { keyPrefix: 'nav.user' });
  const active = i18n.language;

  return (
    <>
      {LOCALES.map((locale, idx) => {
        const isActive = locale === active;
        return (
          <DropdownMenuItem
            key={locale}
            onClick={() => {
              if (isActive) return;
              void i18n.changeLanguage(locale);
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
