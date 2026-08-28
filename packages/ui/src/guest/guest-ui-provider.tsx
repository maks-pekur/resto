'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
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
}

const FallbackImage: GuestImageComponent = ({ src, alt, className, priority }) => (
  <img
    src={src}
    alt={alt}
    className={className}
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
  readonly children: ReactNode;
}

export const GuestUiProvider = ({
  locale,
  t,
  Image = FallbackImage,
  children,
}: GuestUiProviderProps) => {
  const value = useMemo<GuestUiContextValue>(() => ({ locale, t, Image }), [locale, t, Image]);
  return <GuestUiContext.Provider value={value}>{children}</GuestUiContext.Provider>;
};

export const useGuestUi = (): GuestUiContextValue => {
  const value = useContext(GuestUiContext);
  if (!value) throw new Error('Guest UI components must be rendered inside <GuestUiProvider>.');
  return value;
};
