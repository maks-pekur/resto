'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type { MenuDto, MenuItemDto } from '@resto/api-client/public';
import { TenantHeader } from '@/components/layout/tenant-header';
import { CategoryNav } from '@/components/menu/category-nav';
import { MenuItemCard } from '@/components/menu/menu-item-card';
import { ItemModal } from '@/components/menu/item-modal';
import { DeliveryPickupBanner } from '@/components/menu/delivery-pickup-banner';
import { CartDrawer } from '@/components/menu/cart-drawer';
import { useCartStore, selectItemCount } from '@resto/cart';
import { useHasHydrated } from '@/hooks/use-cart-store';
import { localized } from '@/lib/i18n/localized';

interface MenuPageClientProps {
  readonly menu: MenuDto;
}

export function MenuPageClient({ menu }: MenuPageClientProps) {
  const locale = useLocale();
  const t = useTranslations('menu');
  const tCart = useTranslations('cart');

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  const addItem = useCartStore((s) => s.addItem);
  const itemCount = useCartStore(selectItemCount);
  const hasHydrated = useHasHydrated();
  const displayCount = hasHydrated ? itemCount : 0;

  const selectedItem: MenuItemDto | null =
    selectedItemId != null ? (menu.items.find((it) => it.id === selectedItemId) ?? null) : null;

  const relevantModifierGroups = selectedItem
    ? menu.modifierGroups.filter((g) => selectedItem.modifierGroupIds.includes(g.id))
    : [];

  const handleSelect = (id: string) => {
    setSelectedItemId(id);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setSelectedItemId(null);
  };

  const itemsByCategory = new Map<string, MenuItemDto[]>();
  for (const item of menu.items) {
    const list = itemsByCategory.get(item.categoryId);
    if (list) {
      list.push(item);
    } else {
      itemsByCategory.set(item.categoryId, [item]);
    }
  }

  const populatedCategories = menu.categories.filter(
    (cat) => (itemsByCategory.get(cat.id)?.length ?? 0) > 0,
  );

  return (
    <>
      <TenantHeader
        brand={menu.brand}
        cartItemCount={displayCount}
        onOpenCart={() => {
          setCartOpen(true);
        }}
      />

      <DeliveryPickupBanner />

      <CategoryNav categories={populatedCategories} />

      <main className="pt-[160px]">
        {menu.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <h2 className="text-[20px] font-semibold leading-[1.2]">{t('emptyHeading')}</h2>
            <p className="mt-2 max-w-sm text-[16px] leading-[1.5] text-[oklch(0.45_0_0)]">
              {t('emptyBody')}
            </p>
          </div>
        ) : (
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
            {populatedCategories.map((category) => {
              const items = itemsByCategory.get(category.id) ?? [];
              const categoryName = localized(category.name, locale);
              return (
                <section
                  key={category.id}
                  id={`section-${category.id}`}
                  aria-labelledby={`heading-${category.id}`}
                  className="mb-12 scroll-mt-[160px]"
                >
                  <h2
                    id={`heading-${category.id}`}
                    className="mb-4 text-[20px] font-semibold leading-[1.2]"
                  >
                    {categoryName}
                  </h2>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {items.map((item) => (
                      <MenuItemCard
                        key={item.id}
                        item={item}
                        onSelect={handleSelect}
                        unavailable={item.isStopListed}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>

      <CartDrawer open={cartOpen} onOpenChange={setCartOpen} currency={menu.currency} />

      <ItemModal
        item={selectedItem}
        modifierGroups={relevantModifierGroups}
        currency={menu.currency}
        open={modalOpen}
        onClose={handleCloseModal}
        onAddToCart={(lineItem) => {
          addItem(lineItem);
          toast(tCart('addedToCart'));
        }}
      />
    </>
  );
}
