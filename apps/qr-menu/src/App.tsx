import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useCartStore } from '@resto/cart';
import { buildTenantThemeVars } from '@resto/config-tailwind';
import { GuestUiProvider, MenuScreen, ThemeSwitcher, Toaster, useGuestTheme } from '@resto/ui';
import type { MenuDto } from '@resto/api-client/public';
import { fetchAvailability, fetchMenu, MenuNotFoundError } from './api/client';
import { LocaleControl } from './components/LocaleControl';
import { StatusScreen } from './components/StatusScreen';
import { TableBanner, sanitizeTable } from './components/TableBanner';
import { getActiveLocale, t } from './i18n';

const ITEM_PATH = /^\/items\/([^/]+)\/?$/;

const parseItemId = (pathname: string): string | null => ITEM_PATH.exec(pathname)?.[1] ?? null;

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; menu: MenuDto }
  | { kind: 'not-found' }
  | { kind: 'error' };

const AVAILABILITY_POLL_MS = 20_000;

/** A menu left open on a table would otherwise never see a republish — the app
 * fetches once and the guest reads for hours. Photo URLs are immutable, so this
 * is a plain conditional refetch: 304 while nothing changed. */
const MENU_MAX_AGE_MS = 45 * 60 * 1000;

export const App = () => {
  const { theme, resolvedTheme, setTheme } = useGuestTheme();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [stoppedItemIds, setStoppedItemIds] = useState<readonly string[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [openItemId, setOpenItemId] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : parseItemId(window.location.pathname),
  );
  const menuFetchedAt = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: 'loading' });
    fetchMenu(controller.signal)
      .then((menu) => {
        menuFetchedAt.current = Date.now();
        setState({ kind: 'ready', menu });
      })
      .catch((err: unknown) => {
        if (err instanceof MenuNotFoundError) {
          setState({ kind: 'not-found' });
        } else if ((err as { name?: string }).name === 'AbortError') {
          // ignore — component unmounted
        } else {
          setState({ kind: 'error' });
        }
      });
    fetchAvailability(controller.signal)
      .then((availability) => {
        setStoppedItemIds(availability.stoppedItemIds);
      })
      .catch(() => undefined);
    return () => {
      controller.abort();
    };
  }, [attempt]);

  useEffect(() => {
    if (state.kind !== 'ready') return;
    const controller = new AbortController();
    const refresh = (): void => {
      if (document.hidden) return;
      fetchAvailability(controller.signal)
        .then((availability) => {
          setStoppedItemIds(availability.stoppedItemIds);
        })
        .catch(() => undefined);

      if (Date.now() - menuFetchedAt.current < MENU_MAX_AGE_MS) return;
      fetchMenu(controller.signal)
        .then((menu) => {
          menuFetchedAt.current = Date.now();
          setState({ kind: 'ready', menu });
        })
        .catch(() => undefined);
    };
    const interval = window.setInterval(refresh, AVAILABILITY_POLL_MS);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [state.kind]);

  useEffect(() => {
    if (state.kind !== 'ready') return;
    const theme = state.menu.tenant?.theme;
    if (!theme) return;
    for (const [name, value] of Object.entries(buildTenantThemeVars(theme))) {
      document.documentElement.style.setProperty(name, value);
    }
  }, [state]);

  useEffect(() => {
    const onPopState = (): void => {
      setOpenItemId(parseItemId(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, []);

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('table');
    if (raw == null) return;
    const sanitized = sanitizeTable(raw);
    if (sanitized) useCartStore.getState().setTable(sanitized);
  }, []);

  const openItem = useCallback((id: string) => {
    window.history.pushState(null, '', `/items/${id}`);
    setOpenItemId(id);
  }, []);

  const closeItem = useCallback(() => {
    window.history.pushState(null, '', '/');
    setOpenItemId(null);
  }, []);

  const retry = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);

  return (
    <GuestUiProvider locale={getActiveLocale()} t={t}>
      {state.kind === 'loading' ? (
        <StatusScreen title={t('menu.title')} live />
      ) : state.kind === 'not-found' ? (
        <StatusScreen title={t('menu.notFound.title')} body={t('menu.notFound.body')} />
      ) : state.kind === 'error' ? (
        <StatusScreen title={t('menu.error.title')} body={t('menu.error.body')} onRetry={retry} />
      ) : (
        <MenuScreen
          menu={state.menu}
          stoppedItemIds={stoppedItemIds}
          initialItemId={openItemId}
          onItemOpen={openItem}
          onItemClose={closeItem}
          onAddedToCart={() => {
            toast(t('cart.added'));
          }}
          headerActions={
            <>
              <ThemeSwitcher theme={theme} onSelect={setTheme} className="hidden sm:inline-flex" />
              <LocaleControl className="hidden sm:inline-flex" />
            </>
          }
          footerActions={
            <div className="flex flex-wrap items-center gap-2">
              <LocaleControl />
              <ThemeSwitcher theme={theme} onSelect={setTheme} />
            </div>
          }
          banner={<TableBanner />}
        />
      )}
      <Toaster position="bottom-center" theme={resolvedTheme} />
    </GuestUiProvider>
  );
};
