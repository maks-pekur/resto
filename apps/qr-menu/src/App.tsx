import { useEffect, useState } from 'react';
import { fetchMenu, MenuNotFoundError } from './api/client';
import type { MenuDto } from './api/types';
import { ItemDetail } from './components/ItemDetail';
import { MenuView } from './components/MenuView';
import { NotFound } from './components/NotFound';
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
    return <ItemDetail item={item} onBack={navigateToMenu} />;
  }
  return <MenuView menu={state.menu} onSelectItem={navigateToItem} />;
};
