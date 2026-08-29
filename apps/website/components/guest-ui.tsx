'use client';

import { useCallback, type ReactNode } from 'react';
import Image from 'next/image';
import { useLocale, useMessages } from 'next-intl';
import { GuestUiProvider, type GuestImageComponent, type GuestTranslate } from '@resto/ui';

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

export function GuestUi({ children }: { children: ReactNode }) {
  const locale = useLocale();
  const messages = useMessages() as Record<string, unknown>;

  const translate = useCallback<GuestTranslate>(
    (key, values) => interpolate(lookup(messages, key), values),
    [messages],
  );

  return (
    <GuestUiProvider locale={locale} t={translate} Image={NextGuestImage}>
      {children}
    </GuestUiProvider>
  );
}
