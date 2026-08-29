'use client';

import type { MenuItemDto, MenuModifierGroupDto } from '@resto/api-client/public';
import type { CartLineItem } from '@resto/cart';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog';
import { ItemDetail } from './item-detail';

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
  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="max-h-[92dvh] gap-0 overflow-y-auto p-0 sm:max-w-3xl"
      >
        <ItemDetail
          key={item.id}
          Heading={DialogTitle}
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
