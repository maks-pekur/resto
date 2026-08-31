import { useCallback, useEffect, useRef, useState } from 'react';
import { useCartStore } from '@resto/cart';
import { buildTenantThemeVars } from '@resto/config-tailwind';
import {
  CartIcon,
  InfoIcon,
  MenuIcon,
  GuestUiProvider,
  MenuScreen,
  ThemeToggle,
  Toaster,
  localized,
  useGuestTheme,
} from '@resto/ui';
import type { MenuDto } from '@resto/api-client/public';
import { fetchAvailability, fetchMenu, fetchTable, MenuNotFoundError } from './api/client';
import { InfoSheet } from './components/InfoSheet';
import { TabBar } from './components/TabBar';
import { LocaleControl } from './components/LocaleControl';
import { StatusScreen } from './components/StatusScreen';
import { TableBanner } from './components/TableBanner';
import { adoptTenantLocales, getActiveLocale, t } from './i18n';

const ITEM_PATH = /^\/items\/([^/]+)\/?$/;

const parseItemId = (pathname: string): string | null => ITEM_PATH.exec(pathname)?.[1] ?? null;

const parseTableId = (search: string): string | undefined => {
  const raw = new URLSearchParams(search).get('t');
  return raw != null && raw.trim().length > 0 ? raw : undefined;
};

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
  const { resolvedTheme, toggleTheme } = useGuestTheme();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [stoppedItemIds, setStoppedItemIds] = useState<readonly string[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [openItemId, setOpenItemId] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : parseItemId(window.location.pathname),
  );
  const [tableIdParam] = useState<string | undefined>(() =>
    typeof window === 'undefined' ? undefined : parseTableId(window.location.search),
  );
  const [tableUnrecognized, setTableUnrecognized] = useState(false);
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
    fetchAvailability(tableIdParam, controller.signal)
      .then((availability) => {
        setStoppedItemIds(availability.stoppedItemIds);
      })
      .catch(() => undefined);
    if (tableIdParam) {
      fetchTable(tableIdParam, controller.signal)
        .then((resolved) => {
          if (resolved) {
            setTableUnrecognized(false);
            useCartStore.getState().setTable({
              tableId: resolved.tableId,
              zoneName: resolved.zoneName,
              number: resolved.number,
            });
          } else {
            setTableUnrecognized(true);
          }
        })
        .catch((err: unknown) => {
          if ((err as { name?: string }).name === 'AbortError') return;
          setTableUnrecognized(true);
        });
    }
    return () => {
      controller.abort();
    };
  }, [attempt, tableIdParam]);

  useEffect(() => {
    if (state.kind !== 'ready') return;
    const controller = new AbortController();
    const refresh = (): void => {
      if (document.hidden) return;
      fetchAvailability(tableIdParam, controller.signal)
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
  }, [state.kind, tableIdParam]);

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

  const menuLocales =
    state.kind === 'ready'
      ? (state.menu.tenant?.locales ?? { default: undefined, supported: [] })
      : { default: undefined, supported: [] };

  const [localeRevision, setLocaleRevision] = useState(0);
  useEffect(() => {
    if (menuLocales.default === undefined) return;
    if (adoptTenantLocales(menuLocales.supported, menuLocales.default)) {
      setLocaleRevision((n) => n + 1);
    }
  }, [menuLocales.default, menuLocales.supported]);

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

  const [infoOpen, setInfoOpen] = useState(false);
  const tenant = state.kind === 'ready' ? state.menu.tenant : null;

  return (
    <GuestUiProvider
      key={localeRevision}
      locale={getActiveLocale()}
      t={t}
      {...(menuLocales.default === undefined ? {} : { defaultContentLocale: menuLocales.default })}
    >
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
          headerActions={
            <>
              <ThemeToggle
                resolvedTheme={resolvedTheme}
                onToggle={toggleTheme}
                label={t('theme.label')}
                className="hidden sm:flex"
              />
              <LocaleControl locales={menuLocales.supported} className="hidden sm:inline-flex" />
            </>
          }
          footerActions={
            <div className="flex flex-wrap items-center gap-2">
              <LocaleControl locales={menuLocales.supported} />
              <ThemeToggle
                resolvedTheme={resolvedTheme}
                onToggle={toggleTheme}
                label={t('theme.label')}
              />
            </div>
          }
          banner={<TableBanner notRecognized={tableUnrecognized} />}
          showCartButton={false}
          itemPresentation="sheet"
          bar={({ itemCount, openCart }) => (
            <TabBar
              ariaLabel={t('nav.label')}
              active={infoOpen ? 'info' : 'menu'}
              tabs={[
                {
                  id: 'menu',
                  label: t('nav.menu'),
                  icon: MenuIcon,
                  onSelect: () => {
                    setInfoOpen(false);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  },
                },
                {
                  id: 'cart',
                  label: t('nav.cart'),
                  icon: CartIcon,
                  badge: itemCount,
                  onSelect: openCart,
                },
                {
                  id: 'info',
                  label: t('nav.info'),
                  icon: InfoIcon,
                  onSelect: () => {
                    setInfoOpen(true);
                  },
                },
              ]}
            />
          )}
        />
      )}
      <InfoSheet
        open={infoOpen}
        onOpenChange={setInfoOpen}
        tenantName={tenant?.displayName ?? t('menu.title')}
        description={localized(tenant?.description, getActiveLocale(), menuLocales.default)}
        contacts={tenant?.contacts ?? {}}
        socials={tenant?.socials ?? {}}
      />
      <Toaster position="bottom-center" theme={resolvedTheme} />
    </GuestUiProvider>
  );
};
