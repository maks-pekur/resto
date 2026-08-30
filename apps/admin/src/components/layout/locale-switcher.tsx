import { useTranslation } from 'react-i18next';
import { Check, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface LocaleOption {
  readonly code: string;
  readonly flag: string | null;
  readonly labelKey: 'localeRu' | 'localeEn' | 'localeEs';
}

const LOCALES: readonly LocaleOption[] = [
  { code: 'ru', flag: '🇷🇺', labelKey: 'localeRu' },
  { code: 'en', flag: '🇬🇧', labelKey: 'localeEn' },
  { code: 'es', flag: '🇪🇸', labelKey: 'localeEs' },
];

/** A flag disc with the language code on it — a locale a person recognises before they read. */
function LocaleDisc({
  option,
  withCode = true,
  className,
}: {
  option: LocaleOption;
  withCode?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      <span className="ring-border bg-muted grid size-7 place-items-center overflow-hidden rounded-full text-base leading-none ring-1">
        {option.flag ?? <Globe className="text-muted-foreground size-4" />}
      </span>
      {withCode ? (
        <span className="bg-primary text-primary-foreground border-background absolute -right-1 -bottom-1 rounded-full border px-1 text-[9px] leading-[1.3] font-bold tracking-wide uppercase">
          {option.code}
        </span>
      ) : null}
    </span>
  );
}

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
          <LocaleDisc option={active} withCode={false} />
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
              <LocaleDisc option={locale} />
              <span className="flex-1">{t(locale.labelKey)}</span>
              {isActive ? <Check className="size-4" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
