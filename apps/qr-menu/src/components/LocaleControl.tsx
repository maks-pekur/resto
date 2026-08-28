import { LocaleSwitcher } from '@resto/ui';
import { getActiveLocale, setLocale } from '../i18n';

const LOCALES: readonly string[] = ['en', 'ru'];

interface Props {
  readonly className?: string;
}

export const LocaleControl = ({ className = '' }: Props) => (
  <LocaleSwitcher
    locales={LOCALES}
    activeLocale={getActiveLocale()}
    className={className}
    onSelect={(locale) => {
      document.cookie = `locale=${locale}; path=/; max-age=31536000`;
      setLocale(locale);
      window.location.reload();
    }}
  />
);
