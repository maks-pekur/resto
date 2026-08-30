'use client';

import { useRouter } from 'next/navigation';
import { LocaleSwitcher } from '@resto/ui';
import { useLocale } from 'next-intl';
import { useContentLocales } from '@/components/guest-ui';
import { LOCALE_COOKIE_NAME } from '@/lib/i18n/locales';

const ONE_YEAR_SECONDS = 31_536_000;

export function LocaleControl({ className = '' }: { className?: string }) {
  const router = useRouter();
  const locale = useLocale();
  const locales = useContentLocales();

  return (
    <LocaleSwitcher
      locales={locales}
      activeLocale={locale}
      className={className}
      onSelect={(next) => {
        document.cookie = `${LOCALE_COOKIE_NAME}=${next}; path=/; max-age=${ONE_YEAR_SECONDS.toString()}; samesite=lax`;
        router.refresh();
      }}
    />
  );
}
