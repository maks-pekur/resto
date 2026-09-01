import { useCallback, useEffect, useRef, useState } from 'react';
import { useCartStore } from '@resto/cart';
import { buildTenantThemeVars } from '@resto/config-tailwind';
import {
  CartIcon,
  InfoIcon,
  MenuIcon,
  GuestUiProvider,
  MenuScreen,
  Toaster,
  useGuestTheme,
  BurgerIcon,
  UserIcon,
} from '@resto/ui';
import type { MenuDto } from '@resto/api-client/public';
import type { PlacedOrder } from './api/client';
import {
  fetchAvailability,
  fetchMenu,
  fetchTableSession,
  openTableSession,
  MenuNotFoundError,
  fetchVenue,
  fetchLegalDocuments,
} from './api/client';
import { CheckoutSheet, type PaymentChoice } from './components/CheckoutSheet';
import { AccountSheet } from './components/AccountSheet';
import { DocumentSheet } from './components/DocumentSheet';
import { GuestDrawer } from './components/GuestDrawer';
import { InfoSheet } from './components/InfoSheet';
import { OrderStatusSheet } from './components/OrderStatusSheet';
import { TabBar } from './components/TabBar';
import { LocaleControl } from './components/LocaleControl';
import { StatusScreen } from './components/StatusScreen';
import { TableProblemSheet } from './components/TableProblemSheet';
import type { LegalDocumentKeyDto, LegalDocumentsDto, VenueDto } from '@resto/api-client/public';
import { adoptTenantLocales, getActiveLocale, localized, t } from './i18n';

const ITEM_PATH = /^\/items\/([^/]+)\/?$/;
const INFO_PATH = /^\/info\/([a-z]+)\/?$/;
const TABLE_PATH = /^\/t\/([^/]+)\/?$/;

const parseItemId = (pathname: string): string | null => ITEM_PATH.exec(pathname)?.[1] ?? null;

/** A document the venue publishes. In the address bar so back closes it and a link can be sent. */
const parseDocumentKey = (pathname: string): LegalDocumentKeyDto | null => {
  const key = INFO_PATH.exec(pathname)?.[1];
  return key !== undefined && LEGAL_KEYS.has(key) ? (key as LegalDocumentKeyDto) : null;
};

const LEGAL_KEYS = new Set(['about', 'payment', 'returns', 'cookies', 'terms', 'privacy']);

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
  const { resolvedTheme, setTheme } = useGuestTheme();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [stoppedItemIds, setStoppedItemIds] = useState<readonly string[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [seatingFor, setSeatingFor] = useState<'unreadable' | 'ordering' | null>(null);
  const [openItemId, setOpenItemId] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : parseItemId(window.location.pathname),
  );
  const [tableId, setTableId] = useState<string | undefined>(undefined);
  const [venue, setVenue] = useState<VenueDto | null>(null);

  const menuFetchedAt = useRef(0);

  // Hours and wi-fi follow the table: which point the guest sits in is the server's answer.
  useEffect(() => {
    const controller = new AbortController();
    fetchVenue(controller.signal)
      .then(setVenue)
      .catch(() => undefined);
    return () => {
      controller.abort();
    };
  }, [tableId]);

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
      setSeatingFor(null);
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
          setSeatingFor('unreadable');
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
      setDocKey(parseDocumentKey(window.location.pathname));
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

  const openDocument = useCallback((key: LegalDocumentKeyDto) => {
    window.history.pushState(null, '', `/info/${key}`);
    setDocKey(key);
  }, []);

  const closeDocument = useCallback(() => {
    // Back rather than a new entry: the document was pushed on top of wherever the guest was.
    if (parseDocumentKey(window.location.pathname) !== null) window.history.back();
    setDocKey(null);
  }, []);

  const retry = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);

  const [infoOpen, setInfoOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [docKey, setDocKey] = useState<LegalDocumentKeyDto | null>(() =>
    typeof window === 'undefined' ? null : parseDocumentKey(window.location.pathname),
  );
  const [documents, setDocuments] = useState<LegalDocumentsDto | null>(null);

  // Pulled once the guest asks for them — by opening the drawer or by arriving on a document's
  // own address, which a shared link does.
  useEffect(() => {
    if (documents !== null || (!drawerOpen && docKey === null)) return;
    const controller = new AbortController();
    fetchLegalDocuments(controller.signal)
      .then((loaded) => {
        if (loaded !== null) setDocuments(loaded);
      })
      .catch(() => undefined);
    return () => {
      controller.abort();
    };
  }, [drawerOpen, docKey, documents]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  // Pressed "order" with no table: the scan sheet stands in, then hands the guest straight on.
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
              <LocaleControl locales={menuLocales.supported} />
              <button
                type="button"
                aria-label={t('nav.profile')}
                data-testid="account-trigger"
                onClick={() => {
                  setAccountOpen(true);
                }}
                className="focus-visible:ring-ring flex size-11 cursor-pointer items-center justify-center rounded-full transition focus-visible:ring-2 focus-visible:outline-none sm:size-10"
              >
                <span className="ring-border bg-muted text-muted-foreground grid size-9 place-items-center rounded-full ring-1">
                  <UserIcon className="size-[1.125rem]" />
                </span>
              </button>
              <button
                type="button"
                aria-label={t('drawer.open')}
                data-testid="drawer-trigger"
                onClick={() => {
                  setDrawerOpen(true);
                }}
                className="focus-visible:ring-ring flex size-11 cursor-pointer items-center justify-center rounded-full transition focus-visible:ring-2 focus-visible:outline-none sm:size-10"
              >
                {/* The same disc the language and profile controls wear, so the three read as one row. */}
                <span className="ring-border bg-muted text-foreground grid size-9 place-items-center rounded-full ring-1">
                  <BurgerIcon className="size-5" />
                </span>
              </button>
            </>
          }
          cartPrimaryAction={
            <button
              type="button"
              onClick={() => {
                if (tableId === undefined) {
                  setSeatingFor('ordering');
                  return;
                }
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
      <TableProblemSheet
        open={seatingFor !== null}
        reason={seatingFor ?? 'unreadable'}
        onOpenChange={(next) => {
          if (!next) setSeatingFor(null);
        }}
        onSeated={(resolved) => {
          setTableId(resolved.tableId);
          // Where the guest was going before the table got in the way.
          if (seatingFor === 'ordering') setCheckoutOpen(true);
          setSeatingFor(null);
        }}
      />
      <CheckoutSheet
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        currency={state.kind === 'ready' ? state.menu.currency : 'EUR'}
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
      <GuestDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        tenantName={tenant?.displayName ?? t('menu.title')}
        venue={venue}
        socials={tenant?.socials ?? {}}
        onSignIn={() => {
          setAccountOpen(true);
        }}
        documents={documents}
        onOpenDocument={openDocument}
        resolvedTheme={resolvedTheme}
        onThemeChange={setTheme}
      />

      <DocumentSheet
        open={docKey !== null}
        onOpenChange={(next) => {
          if (!next) closeDocument();
        }}
        title={docKey === null ? '' : t(`drawer.doc.${docKey}`)}
        body={docKey === null ? '' : localized(documents?.[docKey])}
      />

      <AccountSheet open={accountOpen} onOpenChange={setAccountOpen} />

      <InfoSheet
        open={infoOpen}
        onOpenChange={setInfoOpen}
        tenantName={tenant?.displayName ?? t('menu.title')}
        description={localized(tenant?.description)}
        contacts={tenant?.contacts ?? {}}
        socials={tenant?.socials ?? {}}
        coverUrl={tenant?.theme?.coverUrl ?? null}
        openingHours={venue?.openingHours ?? null}
        wifi={venue?.wifi ?? null}
      />
      <Toaster position="bottom-center" theme={resolvedTheme} />
    </GuestUiProvider>
  );
};
