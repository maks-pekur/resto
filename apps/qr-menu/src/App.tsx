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
import type { PlacedOrder } from './api/client';
import {
  fetchAvailability,
  fetchMenu,
  fetchTableSession,
  openTableSession,
  MenuNotFoundError,
} from './api/client';
import { CheckoutSheet, type PaymentChoice } from './components/CheckoutSheet';
import { InfoSheet } from './components/InfoSheet';
import { OrderStatusSheet } from './components/OrderStatusSheet';
import { TabBar } from './components/TabBar';
import { LocaleControl } from './components/LocaleControl';
import { StatusScreen } from './components/StatusScreen';
import { TableBanner } from './components/TableBanner';
import { adoptTenantLocales, getActiveLocale, t } from './i18n';

const ITEM_PATH = /^\/items\/([^/]+)\/?$/;
const TABLE_PATH = /^\/t\/([^/]+)\/?$/;

const parseItemId = (pathname: string): string | null => ITEM_PATH.exec(pathname)?.[1] ?? null;

/** The code's secret, which the app trades for a session and then wipes from the address bar. */
const parseQrToken = (pathname: string): string | null => TABLE_PATH.exec(pathname)?.[1] ?? null;

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
  const [tableId, setTableId] = useState<string | undefined>(undefined);
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
    fetchAvailability(tableId, controller.signal)
      .then((availability) => {
        setStoppedItemIds(availability.stoppedItemIds);
      })
      .catch(() => undefined);
    return () => {
      controller.abort();
    };
  }, [attempt, tableId]);

  // A scanned code is spent on arrival: it opens a session, then leaves the address bar so the
  // link in the browser history names no table.
  useEffect(() => {
    const controller = new AbortController();
    const token = parseQrToken(window.location.pathname);

    const seat = (resolved: { tableId: string; zoneName: string; number: string }): void => {
      setTableUnrecognized(false);
      setTableId(resolved.tableId);
      useCartStore.getState().setTable(resolved);
    };

    if (token !== null) {
      openTableSession(token)
        .then((resolved) => {
          seat(resolved);
          window.history.replaceState(null, '', '/');
        })
        .catch(() => {
          setTableUnrecognized(true);
          window.history.replaceState(null, '', '/');
        });
      return () => {
        controller.abort();
      };
    }

    fetchTableSession(controller.signal)
      .then((resolved) => {
        if (resolved !== null) seat(resolved);
      })
      .catch(() => undefined);

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (state.kind !== 'ready') return;
    const controller = new AbortController();
    const refresh = (): void => {
      if (document.hidden) return;
      fetchAvailability(tableId, controller.signal)
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
  }, [state.kind, tableId]);

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
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [placed, setPlaced] = useState<{ order: PlacedOrder; payment: PaymentChoice } | null>(null);
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
              />
              <LocaleControl locales={menuLocales.supported} />
            </>
          }
          banner={<TableBanner notRecognized={tableUnrecognized} />}
          cartPrimaryAction={
            <button
              type="button"
              onClick={() => {
                setCheckoutOpen(true);
              }}
              className="bg-primary text-primary-foreground focus-visible:ring-ring flex h-12 w-full cursor-pointer items-center justify-center rounded-full px-5 text-base font-bold transition-transform active:scale-[0.99] focus-visible:ring-2 focus-visible:outline-none"
            >
              {t('checkout.open')}
            </button>
          }
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
      <CheckoutSheet
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        currency={state.kind === 'ready' ? state.menu.currency : 'EUR'}
        tableId={tableId}
        onTableScanned={setTableId}
        onPlaced={(order, payment) => {
          setPlaced({ order, payment });
        }}
      />
      {placed === null ? null : (
        <OrderStatusSheet
          open
          onOpenChange={(next) => {
            if (!next) setPlaced(null);
          }}
          order={placed.order}
          payment={placed.payment}
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
