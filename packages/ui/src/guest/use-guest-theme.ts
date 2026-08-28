'use client';

import { useCallback, useEffect, useState } from 'react';

export type GuestTheme = 'system' | 'light' | 'dark';

export const GUEST_THEMES: readonly GuestTheme[] = ['system', 'light', 'dark'];

const STORAGE_KEY = 'resto.theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

const isGuestTheme = (value: unknown): value is GuestTheme =>
  value === 'system' || value === 'light' || value === 'dark';

const readStoredTheme = (): GuestTheme => {
  try {
    const stored: unknown = window.localStorage.getItem(STORAGE_KEY);
    return isGuestTheme(stored) ? stored : 'system';
  } catch {
    // Private mode and blocked site data throw on read, not only on write.
    return 'system';
  }
};

export interface GuestThemeState {
  readonly theme: GuestTheme;
  readonly resolvedTheme: 'light' | 'dark';
  readonly setTheme: (theme: GuestTheme) => void;
}

/**
 * Owns the guest theme preference. The `data-theme` attribute on <html> is the
 * single switch the token layer reads; `system` is resolved by CSS, not here, so
 * the first paint is already correct without an inline script.
 */
export const useGuestTheme = (): GuestThemeState => {
  const [theme, setThemeState] = useState<GuestTheme>(() =>
    typeof window === 'undefined' ? 'system' : readStoredTheme(),
  );
  const [systemPrefersDark, setSystemPrefersDark] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(DARK_QUERY).matches,
  );

  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY);
    const onChange = (event: MediaQueryListEvent): void => {
      setSystemPrefersDark(event.matches);
    };
    media.addEventListener('change', onChange);
    return () => {
      media.removeEventListener('change', onChange);
    };
  }, []);

  const resolvedTheme: 'light' | 'dark' =
    theme === 'system' ? (systemPrefersDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    // Read the applied token rather than repeating the palette here, so the
    // browser chrome can never drift from the page it sits above.
    const background = getComputedStyle(root).getPropertyValue('--background').trim();
    if (background) {
      for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
        meta.setAttribute('content', background);
      }
    }
  }, [theme, resolvedTheme]);

  const setTheme = useCallback((next: GuestTheme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Preference is lost on reload, the session still works.
    }
  }, []);

  return { theme, resolvedTheme, setTheme };
};
