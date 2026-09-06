import { LocaleSwitcher } from '@resto/ui';
import { getActiveLocale, setLocale } from '../i18n';

interface Props {
  readonly locales: readonly string[];
  readonly className?: string;
}

/** The languages come from the restaurant's own configuration, not from a list baked in here. */
export const LocaleControl = ({ locales, className = '' }: Props) => (
  <LocaleSwitcher
    locales={locales}
    activeLocale={getActiveLocale()}
    className={className}
    onSelect={(locale) => {
      document.cookie = `locale=${locale}; path=/; max-age=31536000`;
      setLocale(locale);
      window.location.reload();
    }}
  />
);
