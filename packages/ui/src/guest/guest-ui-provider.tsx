'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { cn } from '../lib/utils';
import type { GuestUiKey } from './messages';

export interface GuestImageProps {
  readonly src: string;
  readonly alt: string;
  readonly className?: string;
  readonly sizes?: string;
  readonly priority?: boolean;
}

export type GuestImageComponent = (props: GuestImageProps) => ReactNode;

export type GuestTranslate = (key: GuestUiKey, values?: Record<string, string | number>) => string;

export interface GuestUiContextValue {
  readonly locale: string;
  readonly t: GuestTranslate;
  readonly Image: GuestImageComponent;
  /** The tenant's own default content language, used when a field misses the guest's. */
  readonly defaultContentLocale?: string;
}

/** Every guest image sits in a `relative` container and fills it, so the Next
 * host can swap in <Image fill> without the shared markup changing. */
const FallbackImage: GuestImageComponent = ({ src, alt, className, priority }) => (
  <img
    src={src}
    alt={alt}
    className={cn('absolute inset-0', className)}
    loading={priority ? 'eager' : 'lazy'}
    fetchPriority={priority ? 'high' : 'auto'}
    decoding="async"
  />
);

const GuestUiContext = createContext<GuestUiContextValue | null>(null);

export interface GuestUiProviderProps {
  readonly locale: string;
  readonly t: GuestTranslate;
  readonly Image?: GuestImageComponent;
  readonly defaultContentLocale?: string;
  readonly children: ReactNode;
}

export const GuestUiProvider = ({
  locale,
  t,
  Image = FallbackImage,
  defaultContentLocale,
  children,
}: GuestUiProviderProps) => {
  const value = useMemo<GuestUiContextValue>(
    () => ({
      locale,
      t,
      Image,
      ...(defaultContentLocale === undefined ? {} : { defaultContentLocale }),
    }),
    [locale, t, Image, defaultContentLocale],
  );
  return <GuestUiContext.Provider value={value}>{children}</GuestUiContext.Provider>;
};

export const useGuestUi = (): GuestUiContextValue => {
  const value = useContext(GuestUiContext);
  if (!value) throw new Error('Guest UI components must be rendered inside <GuestUiProvider>.');
  return value;
};
