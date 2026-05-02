import { t } from '../i18n';

export const NotFound = () => (
  <main className="state state--not-found">
    <h1>{t('menu.notFound.title')}</h1>
    <p>{t('menu.notFound.body')}</p>
  </main>
);
