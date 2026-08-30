'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import Image from 'next/image';
import { useLocale, useMessages } from 'next-intl';
import {
  GuestUiProvider,
  useGuestTheme,
  type GuestImageComponent,
  type GuestThemeState,
  type GuestTranslate,
} from '@resto/ui';
import { isLocale, LOCALES, type Locale } from '@/lib/i18n/locales';

/** `unoptimized`: menu photos are tenant-supplied URLs on arbitrary hosts, and the
 * only way to serve them through Next's optimizer is a wildcard remotePatterns —
 * an SSRF surface. qr-menu cannot use the optimizer at all, so this also keeps the
 * two guest surfaces rendering the same bytes. */
const NextGuestImage: GuestImageComponent = ({ src, alt, className, sizes, priority = false }) => (
  <Image
    src={src}
    alt={alt}
    fill
    unoptimized
    sizes={sizes ?? '100vw'}
    priority={priority}
    className={className}
  />
);

const lookup = (messages: Record<string, unknown>, key: string): string => {
  let node: unknown = messages;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return key;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : key;
};

const interpolate = (text: string, values?: Record<string, string | number>): string =>
  text.replace(/\{(\w+)\}/g, (_match, name: string) =>
    values && name in values ? String(values[name]) : `{${name}}`,
  );

const SiteThemeContext = createContext<GuestThemeState | null>(null);

export interface ContentLocales {
  readonly default: string;
  readonly supported: readonly string[];
}

const ContentLocalesContext = createContext<ContentLocales | null>(null);

/** The restaurant declares which languages its menu exists in; the site can only
 * render the ones it also has chrome translations for. */
export const useContentLocales = (): readonly Locale[] => {
  const value = useContext(ContentLocalesContext);
  const offered = (value?.supported ?? []).filter(isLocale);
  return offered.length > 0 ? offered : LOCALES;
};

export const useSiteTheme = (): GuestThemeState => {
  const value = useContext(SiteThemeContext);
  if (value === null) throw new Error('useSiteTheme must be used within GuestUi');
  return value;
};

export function GuestUi({
  contentLocales,
  children,
}: {
  contentLocales?: ContentLocales;
  children: ReactNode;
}) {
  const locale = useLocale();
  const messages = useMessages() as Record<string, unknown>;
  const theme = useGuestTheme();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const translate = useCallback<GuestTranslate>(
    (key, values) => interpolate(lookup(messages, key), values),
    [messages],
  );

  // The stored preference is only readable in the browser, so the first client
  // render has to repeat the server's light markup or React throws the tree away.
  const themeValue: GuestThemeState = hydrated ? theme : { ...theme, resolvedTheme: 'light' };

  return (
    <SiteThemeContext.Provider value={themeValue}>
      <ContentLocalesContext.Provider value={contentLocales ?? null}>
        <GuestUiProvider
          locale={locale}
          t={translate}
          Image={NextGuestImage}
          {...(contentLocales === undefined
            ? {}
            : { defaultContentLocale: contentLocales.default })}
        >
          {children}
        </GuestUiProvider>
      </ContentLocalesContext.Provider>
    </SiteThemeContext.Provider>
  );
}
