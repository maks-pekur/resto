import { useEffect, useState } from 'react';
import { useCartStore } from '@resto/cart';
import { buildTenantThemeVars } from '@resto/config-tailwind';
import { fetchMenu, MenuNotFoundError } from './api/client';
import type { MenuDto } from '@resto/api-client/public';
import { ItemDetail } from './components/ItemDetail';
import { MenuView } from './components/MenuView';
import { NotFound } from './components/NotFound';
import { sanitizeTable } from './components/TableBanner';
import { t } from './i18n';

const ITEM_PATH = /^\/items\/([^/]+)\/?$/;

const parsePath = (pathname: string): { kind: 'menu' } | { kind: 'item'; id: string } => {
  const match = ITEM_PATH.exec(pathname);
  if (match?.[1]) return { kind: 'item', id: match[1] };
  return { kind: 'menu' };
};

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; menu: MenuDto }
  | { kind: 'not-found' }
  | { kind: 'error' };

export const App = () => {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [route, setRoute] = useState(() =>
    typeof window === 'undefined' ? { kind: 'menu' as const } : parsePath(window.location.pathname),
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchMenu(controller.signal)
      .then((menu) => {
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
    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (state.kind !== 'ready') return;
    const theme = state.menu.brand?.theme;
    if (!theme) return;
    const vars = buildTenantThemeVars(theme);
    for (const [name, value] of Object.entries(vars)) {
      document.documentElement.style.setProperty(name, value);
    }
  }, [state]);

  useEffect(() => {
    const onPopState = (): void => {
      setRoute(parsePath(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, []);

  const navigateToItem = (id: string): void => {
    window.history.pushState(null, '', `/items/${id}`);
    setRoute({ kind: 'item', id });
  };

  const navigateToMenu = (): void => {
    window.history.pushState(null, '', '/');
    setRoute({ kind: 'menu' });
  };

  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('table');
    if (raw == null) return;
    const sanitized = sanitizeTable(raw);
    if (sanitized) {
      useCartStore.getState().setTable(sanitized);
    }
  }, []);

  if (state.kind === 'loading') {
    return (
      <main className="state state--loading" aria-live="polite">
        <h1>{t('menu.title')}</h1>
      </main>
    );
  }
  if (state.kind === 'not-found') return <NotFound />;
  if (state.kind === 'error') {
    return (
      <main className="state state--error">
        <h1>{t('menu.error.title')}</h1>
        <p>{t('menu.error.body')}</p>
      </main>
    );
  }

  if (route.kind === 'item') {
    const item = state.menu.items.find((i) => i.id === route.id);
    if (!item) return <NotFound />;
    const groups = state.menu.modifierGroups.filter((g) => item.modifierGroupIds.includes(g.id));
    return <ItemDetail item={item} groups={groups} onBack={navigateToMenu} />;
  }
  return (
    <MenuView
      menu={state.menu}
      onSelectItem={navigateToItem}
      cartOpen={cartOpen}
      onOpenCart={() => {
        setCartOpen(true);
      }}
      onCloseCart={() => {
        setCartOpen(false);
      }}
    />
  );
};
