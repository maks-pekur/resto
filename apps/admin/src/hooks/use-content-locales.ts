import { useQuery } from '@tanstack/react-query';
import { DEFAULT_LOCALE } from '@/lib/menu/localized';
import { tenancyQuery } from '@/lib/queries/tenancy';

export interface ContentLocales {
  readonly defaultLocale: string;
  readonly locales: readonly string[];
}

/** The languages the restaurant publishes its menu in — its own configuration, not the set the
 * panel is translated into. */
export const useContentLocales = (): ContentLocales => {
  const { data } = useQuery(tenancyQuery());
  const tenant = data?.ok === true ? data.data : null;
  const defaultLocale = tenant?.locale ?? DEFAULT_LOCALE;
  const locales =
    tenant && tenant.contentLocales.length > 0 ? tenant.contentLocales : [defaultLocale];

  return {
    defaultLocale,
    locales: locales.includes(defaultLocale) ? locales : [defaultLocale, ...locales],
  };
};
