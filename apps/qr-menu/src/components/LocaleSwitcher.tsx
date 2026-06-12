import { setLocale, getActiveLocale, t, type Locale } from '../i18n';

const LOCALES: readonly Locale[] = ['en', 'ru'];

export const LocaleSwitcher = () => (
  <div className="locale-switcher" role="navigation" aria-label={t('locale.label')}>
    {LOCALES.map((locale) => (
      <button
        key={locale}
        type="button"
        aria-current={getActiveLocale() === locale ? 'true' : undefined}
        className={['locale-btn', getActiveLocale() === locale ? 'locale-btn--active' : '']
          .join(' ')
          .trim()}
        onClick={() => {
          document.cookie = `locale=${locale}; path=/; max-age=31536000`;
          setLocale(locale);
          window.location.reload();
        }}
      >
        {locale.toUpperCase()}
      </button>
    ))}
  </div>
);
