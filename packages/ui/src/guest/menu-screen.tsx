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
import { useGuestUi } from './guest-ui-provider';

// Radix dialog + sheet are the two heaviest chunks and neither is needed for the
// first paint of a menu opened over mobile data.
const ItemDialog = lazy(async () => ({ default: (await import('./item-dialog')).ItemDialog }));
const CartSheet = lazy(async () => ({ default: (await import('./cart-sheet')).CartSheet }));

const PRIORITY_IMAGE_COUNT = 4;

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
  readonly banner?: ReactNode;
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
  banner,
  cartPrimaryAction,
}: MenuScreenProps) => {
  const { locale, t } = useGuestUi();
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

  const sections = useMemo(() => {
    const byCategory = new Map<string, MenuItemDto[]>();
    for (const item of menu.items) {
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
  }, [menu]);

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

  let imageIndex = 0;

  return (
    <GuestShell
      header={<GuestHeader tenantName={tenantName} logoUrl={logoUrl} actions={headerActions} />}
      rail={
        <CategoryRail
          categories={sections.map((section) => section.category)}
          action={<CartButton itemCount={itemCount} onOpen={openCart} />}
        />
      }
      banner={banner}
      footer={
        <GuestFooter
          tenantName={tenantName}
          logoUrl={logoUrl}
          links={footerLinks ?? []}
          actions={footerActions}
        />
      }
      bar={<CartBar itemCount={itemCount} total={total} onOpen={openCart} />}
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
                {localized(category.name, locale)}
              </h2>
              <div className="grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2 sm:gap-y-8 lg:grid-cols-3 xl:grid-cols-4">
                {items.map((item) => {
                  const priority = imageIndex < PRIORITY_IMAGE_COUNT;
                  imageIndex += 1;
                  return (
                    <MenuItemCard
                      key={item.id}
                      item={item}
                      onSelect={openItem}
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
            primaryAction={cartPrimaryAction}
          />
        </Suspense>
      ) : null}
    </GuestShell>
  );
};
