'use client';

import { Suspense, lazy, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { MenuDto, MenuItemDto } from '@resto/api-client/public';
import { selectItemCount, selectSubtotal, useCartStore, type CartLineItem } from '@resto/cart';
import { localized } from '../lib/localized';
import { formatPrice } from '../lib/format-price';
import { CartBar } from './cart-bar';
import { CartButton } from './cart-button';
import { CategoryRail, sectionElementId } from './category-rail';
import { GuestFooter, type GuestFooterLink } from './guest-footer';
import { GuestHeader } from './guest-header';
import { GuestShell } from './guest-shell';
import { MenuItemCard } from './menu-item-card';
import { SearchIcon } from '../icons';
import { cn } from '../lib/utils';
import { MenuFinder } from './menu-finder';
import { dietsOf } from './diet-rules';
import { useGuestUi } from './guest-ui-provider';

// Radix dialog + sheet are the two heaviest chunks and neither is needed for the
// first paint of a menu opened over mobile data.
const ItemDialog = lazy(async () => ({ default: (await import('./item-dialog')).ItemDialog }));
const CartSheet = lazy(async () => ({ default: (await import('./cart-sheet')).CartSheet }));

const PRIORITY_IMAGE_COUNT = 4;

export interface MenuScreenBarApi {
  readonly itemCount: number;
  readonly total: string;
  readonly openCart: () => void;
}

export interface MenuScreenProps {
  readonly menu: MenuDto;
  readonly stoppedItemIds: readonly string[];
  readonly initialItemId?: string | null;
  readonly onItemOpen?: (id: string) => void;
  readonly onItemClose?: () => void;
  readonly onAddedToCart?: (line: Omit<CartLineItem, 'quantity'>) => void;
  readonly headerActions?: ReactNode;
  readonly footerActions?: ReactNode;
  readonly footerLinks?: readonly GuestFooterLink[];
  /** `credit` leaves only the platform line — for a surface that shows its contacts elsewhere. */
  readonly footerVariant?: 'full' | 'credit';
  readonly banner?: ReactNode;
  /**
   * Replaces the cart bar — a surface with its own bottom navigation supplies it instead. Given a
   * function, it receives the cart handles the default bar uses.
   */
  readonly bar?: ReactNode | ((api: MenuScreenBarApi) => ReactNode);
  /** The rail's cart button — off where the surface already carries a cart in its own nav. */
  readonly showCartButton?: boolean;
  /** How an item opens: centred for a desktop page, from the bottom edge on a phone. */
  readonly itemPresentation?: 'dialog' | 'sheet';
  /** How the cart arrives: from the side on a page, from the bottom edge on a phone. */
  readonly cartPresentation?: 'drawer' | 'sheet';
  readonly cartPrimaryAction?: ReactNode;
}

export const MenuScreen = ({
  menu,
  stoppedItemIds,
  initialItemId = null,
  onItemOpen,
  onItemClose,
  onAddedToCart,
  headerActions,
  footerActions,
  footerLinks,
  footerVariant = 'full',
  banner,
  bar,
  showCartButton = true,
  itemPresentation = 'dialog',
  cartPresentation = 'drawer',
  cartPrimaryAction,
}: MenuScreenProps) => {
  const { locale, t, defaultContentLocale } = useGuestUi();
  const [selectedItemId, setSelectedItemId] = useState<string | null>(initialItemId);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartMounted, setCartMounted] = useState(false);

  useEffect(() => {
    setSelectedItemId(initialItemId);
  }, [initialItemId]);

  const addItem = useCartStore((s) => s.addItem);
  const itemCount = useCartStore(selectItemCount);
  const subtotal = useCartStore(selectSubtotal);

  const stopped = useMemo(() => new Set(stoppedItemIds), [stoppedItemIds]);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeDiets, setActiveDiets] = useState<readonly string[]>([]);

  /** Every label the menu actually uses — a filter for something nobody cooks is noise. */
  const diets = useMemo(() => {
    const seen = new Set<string>();
    for (const item of menu.items) for (const diet of dietsOf(item.diets)) seen.add(diet);
    return [...seen];
  }, [menu]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (item: MenuItemDto): boolean => {
      const has = dietsOf(item.diets);
      if (activeDiets.length > 0 && !activeDiets.every((diet) => has.has(diet))) return false;
      if (needle.length === 0) return true;
      const haystack = [...Object.values(item.name), ...Object.values(item.description ?? {})];
      return haystack.some((text) => text.toLowerCase().includes(needle));
    };
  }, [query, activeDiets]);

  const sections = useMemo(() => {
    const byCategory = new Map<string, MenuItemDto[]>();
    for (const item of menu.items) {
      if (!matches(item)) continue;
      const list = byCategory.get(item.categoryId);
      if (list) {
        list.push(item);
      } else {
        byCategory.set(item.categoryId, [item]);
      }
    }
    return menu.categories
      .map((category) => ({ category, items: byCategory.get(category.id) ?? [] }))
      .filter((section) => section.items.length > 0);
  }, [menu, matches]);

  const selectedItem = selectedItemId
    ? (menu.items.find((item) => item.id === selectedItemId) ?? null)
    : null;

  // Keep the last item mounted while the dialog plays its close animation.
  const lastItemRef = useRef<MenuItemDto | null>(null);
  if (selectedItem) lastItemRef.current = selectedItem;
  const dialogItem = selectedItem ?? lastItemRef.current;

  const dialogGroups = dialogItem
    ? menu.modifierGroups.filter((group) => dialogItem.modifierGroupIds.includes(group.id))
    : [];

  const tenantName = menu.tenant?.displayName ?? t('menu.title');
  const logoUrl = menu.tenant?.theme?.logoUrl ?? null;
  const tenantDescription = localized(menu.tenant?.description, locale, defaultContentLocale);
  const total = formatPrice(subtotal, menu.currency, locale);

  const openCart = (): void => {
    setCartMounted(true);
    setCartOpen(true);
  };

  const openItem = (id: string): void => {
    setSelectedItemId(id);
    onItemOpen?.(id);
  };

  const closeItem = (): void => {
    setSelectedItemId(null);
    onItemClose?.();
  };

  const quickAdd = (item: MenuDto['items'][number]): void => {
    const line = {
      itemId: item.id,
      sizeId: null,
      name: localized(item.name, locale, defaultContentLocale),
      unitPrice: item.basePrice,
      currency: item.currency,
      imageUrl: item.imageUrl,
      modifiers: [],
    };
    addItem(line);
    onAddedToCart?.(line);
  };

  let imageIndex = 0;

  return (
    <GuestShell
      header={
        <GuestHeader
          tenantName={tenantName}
          logoUrl={logoUrl}
          actions={
            <>
              <button
                type="button"
                aria-label={t('finder.searchToggle')}
                aria-expanded={searchOpen}
                data-testid="search-toggle"
                onClick={() => {
                  setSearchOpen((open) => {
                    // Closing throws the query away: a hidden filter is a menu with dishes
                    // mysteriously missing.
                    if (open) setQuery('');
                    return !open;
                  });
                }}
                className="focus-visible:ring-ring flex size-10 cursor-pointer items-center justify-center rounded-full transition focus-visible:ring-2 focus-visible:outline-none xs:size-11 sm:size-10"
              >
                <span
                  className={cn(
                    'ring-border grid size-8 place-items-center rounded-full ring-1 transition-colors xs:size-9',
                    searchOpen ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
                  )}
                >
                  <SearchIcon className="size-4 xs:size-[1.125rem]" />
                </span>
              </button>
              {headerActions}
            </>
          }
        />
      }
      rail={
        <CategoryRail
          categories={sections.map((section) => section.category)}
          action={
            showCartButton ? <CartButton itemCount={itemCount} onOpen={openCart} /> : undefined
          }
        />
      }
      banner={
        <>
          {/* The page's own gutter, the same the rail and the grid use — the finder used to run
              edge to edge and its chip row pushed a scrollbar out of the side. */}
          <div
            className={cn(
              'mx-auto w-full max-w-7xl px-4 sm:px-6',
              // Clear of the category rail above it, and of the first row of dishes below.
              searchOpen || diets.length > 0 ? 'pt-4 pb-1' : '',
            )}
          >
            <MenuFinder
              searchOpen={searchOpen}
              query={query}
              onQueryChange={setQuery}
              diets={diets}
              activeDiets={activeDiets}
              onToggleDiet={(diet) => {
                setActiveDiets((prev) =>
                  prev.includes(diet) ? prev.filter((entry) => entry !== diet) : [...prev, diet],
                );
              }}
            />
          </div>
          {banner}
        </>
      }
      footer={
        <GuestFooter
          tenantName={tenantName}
          logoUrl={logoUrl}
          description={tenantDescription}
          socials={menu.tenant?.socials ?? {}}
          contacts={menu.tenant?.contacts ?? {}}
          links={footerLinks ?? []}
          actions={footerActions}
          variant={footerVariant}
        />
      }
      bar={
        typeof bar === 'function'
          ? bar({ itemCount, total, openCart })
          : (bar ?? <CartBar itemCount={itemCount} total={total} onOpen={openCart} />)
      }
    >
      {sections.length === 0 ? (
        <div className="mx-auto flex max-w-md flex-col items-center gap-2 px-4 py-24 text-center">
          <h2 className="text-xl font-extrabold">{t('menu.emptyHeading')}</h2>
          <p className="text-muted-foreground text-sm">{t('menu.emptyBody')}</p>
        </div>
      ) : (
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-8">
          {sections.map(({ category, items }) => (
            <section
              key={category.id}
              id={sectionElementId(category.id)}
              aria-labelledby={`menu-heading-${category.id}`}
              className="mb-10 scroll-mt-[calc(var(--header-height)+var(--category-rail-height)+1rem)] [contain-intrinsic-size:auto_38rem] [content-visibility:auto] sm:mb-12"
            >
              <h2
                id={`menu-heading-${category.id}`}
                className="mb-4 text-xl font-extrabold sm:mb-5 sm:text-3xl"
              >
                {localized(category.name, locale, defaultContentLocale)}
              </h2>
              <div className="grid grid-cols-2 gap-x-2 gap-y-5 xs:gap-x-3 xs:gap-y-6 sm:gap-x-5 sm:gap-y-8 lg:grid-cols-3 xl:grid-cols-4">
                {items.map((item) => {
                  const priority = imageIndex < PRIORITY_IMAGE_COUNT;
                  imageIndex += 1;
                  return (
                    <MenuItemCard
                      key={item.id}
                      item={item}
                      onSelect={openItem}
                      onQuickAdd={quickAdd}
                      unavailable={stopped.has(item.id)}
                      priority={priority}
                    />
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {dialogItem ? (
        <Suspense fallback={null}>
          <ItemDialog
            item={dialogItem}
            modifierGroups={dialogGroups}
            currency={menu.currency}
            presentation={itemPresentation}
            open={selectedItem != null}
            onOpenChange={(open) => {
              if (!open) closeItem();
            }}
            onAddToCart={(line) => {
              addItem(line);
              onAddedToCart?.(line);
            }}
          />
        </Suspense>
      ) : null}

      {cartMounted ? (
        <Suspense fallback={null}>
          <CartSheet
            open={cartOpen}
            onOpenChange={setCartOpen}
            currency={menu.currency}
            presentation={cartPresentation}
            primaryAction={cartPrimaryAction}
          />
        </Suspense>
      ) : null}
    </GuestShell>
  );
};
