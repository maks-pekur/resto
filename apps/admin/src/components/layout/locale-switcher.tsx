import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LocaleDisc } from '@/components/common/locale-disc';

interface LocaleOption {
  readonly code: string;
  readonly labelKey: 'localeRu' | 'localeEn' | 'localeEs';
}

/** The languages the panel itself is translated into — shipped with the product, not chosen by
 * the restaurant. The languages its menu exists in are tenant configuration. */
const LOCALES: readonly LocaleOption[] = [
  { code: 'ru', labelKey: 'localeRu' },
  { code: 'en', labelKey: 'localeEn' },
  { code: 'es', labelKey: 'localeEs' },
];

export function LocaleSwitcher() {
  const { t, i18n } = useTranslation('translation', { keyPrefix: 'nav.user' });
  const active = LOCALES.find((locale) => i18n.language.startsWith(locale.code)) ?? LOCALES[0];
  if (active === undefined) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          aria-label={t('languageLabel')}
        >
          <LocaleDisc locale={active.code} withCode={false} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {LOCALES.map((locale) => {
          const isActive = locale.code === active.code;
          return (
            <DropdownMenuItem
              key={locale.code}
              data-testid={`locale-${locale.code}`}
              className="gap-3 py-2"
              onSelect={() => {
                if (isActive) return;
                void i18n.changeLanguage(locale.code);
              }}
            >
              <LocaleDisc locale={locale.code} />
              <span className="flex-1">{t(locale.labelKey)}</span>
              {isActive ? <Check className="size-4" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
