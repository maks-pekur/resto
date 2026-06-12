import { getRequestConfig } from 'next-intl/server';
import { resolveLocale } from './locale-cookie';

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  const messages = (await import(`../../messages/${locale}.json`)) as {
    default: Record<string, unknown>;
  };
  return {
    locale,
    messages: messages.default,
  };
});
