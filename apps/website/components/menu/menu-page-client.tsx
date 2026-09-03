'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type { MenuDto } from '@resto/api-client/public';
import { MenuScreen, type GuestFooterLink } from '@resto/ui';
import { DeliveryPickupBanner } from '@/components/menu/delivery-pickup-banner';
import { LocaleControl } from '@/components/locale-control';

interface MenuPageClientProps {
  readonly menu: MenuDto;
  readonly stoppedItemIds: readonly string[];
  readonly stoppedIngredientIds: readonly string[];
  readonly footerLinks: readonly GuestFooterLink[];
}

export function MenuPageClient({
  menu,
  stoppedItemIds,
  stoppedIngredientIds,
  footerLinks,
}: MenuPageClientProps) {
  const t = useTranslations('cart');

  return (
    <MenuScreen
      menu={menu}
      stoppedItemIds={stoppedItemIds}
      stoppedIngredientIds={stoppedIngredientIds}
      banner={<DeliveryPickupBanner />}
      headerActions={<LocaleControl className="hidden sm:inline-flex" />}
      footerActions={<LocaleControl />}
      footerLinks={footerLinks}
      onAddedToCart={() => {
        toast(t('addedToCart'));
      }}
      cartPrimaryAction={
        <Link
          href="/checkout"
          className="bg-primary text-primary-foreground focus-visible:ring-ring flex h-12 items-center justify-center rounded-full text-base font-bold transition-transform active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          {t('checkout')}
        </Link>
      }
    />
  );
}
