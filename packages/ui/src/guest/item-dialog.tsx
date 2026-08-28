'use client';

import type { MenuItemDto, MenuModifierGroupDto } from '@resto/api-client/public';
import type { CartLineItem } from '@resto/cart';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog';
import { localized } from '../lib/localized';
import { ItemDetail } from './item-detail';
import { useGuestUi } from './guest-ui-provider';

export interface ItemDialogProps {
  readonly item: MenuItemDto | null;
  readonly modifierGroups: readonly MenuModifierGroupDto[];
  readonly currency: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onAddToCart: (line: Omit<CartLineItem, 'quantity'>) => void;
}

export const ItemDialog = ({
  item,
  modifierGroups,
  currency,
  open,
  onOpenChange,
  onAddToCart,
}: ItemDialogProps) => {
  const { locale } = useGuestUi();

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="max-h-[92dvh] gap-0 overflow-y-auto p-0 sm:max-w-3xl"
      >
        <DialogTitle className="sr-only">{localized(item.name, locale)}</DialogTitle>
        <ItemDetail
          key={item.id}
          item={item}
          modifierGroups={modifierGroups}
          currency={currency}
          onAddToCart={(line) => {
            onAddToCart(line);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
};
