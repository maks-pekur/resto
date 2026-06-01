import { getRequestConfig } from 'next-intl/server';
import { resolveLocale } from './locale-cookie';
import { MESSAGES } from './messages-index';

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  return {
    locale,
    messages: MESSAGES[locale],
  };
});
