import { Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CONTENT_LOCALE_FLAG } from '@/lib/i18n/content-locales';

export interface LocaleDiscProps {
  readonly locale: string;
  readonly withCode?: boolean;
  readonly className?: string;
}

/** A flag disc with the language code on it — a locale a person recognises before they read. */
export function LocaleDisc({ locale, withCode = true, className }: LocaleDiscProps) {
  const flag = CONTENT_LOCALE_FLAG[locale as keyof typeof CONTENT_LOCALE_FLAG] as
    | string
    | undefined;

  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      <span className="ring-border bg-muted grid size-7 place-items-center overflow-hidden rounded-full text-base leading-none ring-1">
        {flag ?? <Globe className="text-muted-foreground size-4" />}
      </span>
      {withCode ? (
        <span className="bg-primary text-primary-foreground border-background absolute -right-1 -bottom-1 rounded-full border px-1 text-[9px] leading-[1.3] font-bold tracking-wide uppercase">
          {locale}
        </span>
      ) : null}
    </span>
  );
}
