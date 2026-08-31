'use client';

import type { MenuItemDto, MenuModifierGroupDto } from '@resto/api-client/public';
import type { CartLineItem } from '@resto/cart';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog';
import { Sheet, SheetContent, SheetTitle } from '../components/ui/sheet';
import { ItemDetail } from './item-detail';

export interface ItemDialogProps {
  readonly item: MenuItemDto | null;
  readonly modifierGroups: readonly MenuModifierGroupDto[];
  readonly currency: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onAddToCart: (line: Omit<CartLineItem, 'quantity'>) => void;
  /** A phone reaches the bottom of its screen, not the middle of it. */
  readonly presentation?: 'dialog' | 'sheet';
}

export const ItemDialog = ({
  item,
  modifierGroups,
  currency,
  open,
  onOpenChange,
  onAddToCart,
  presentation = 'dialog',
}: ItemDialogProps) => {
  if (!item) return null;

  const detail = (Heading: typeof DialogTitle | typeof SheetTitle) => (
    <ItemDetail
      key={item.id}
      Heading={Heading}
      item={item}
      modifierGroups={modifierGroups}
      currency={currency}
      onAddToCart={(line) => {
        onAddToCart(line);
        onOpenChange(false);
      }}
    />
  );

  if (presentation === 'sheet') {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[92dvh] w-full max-w-lg gap-0 overflow-y-auto rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)]"
        >
          {/* The grip says the sheet came from the bottom edge and goes back there. */}
          <span aria-hidden className="bg-muted mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full" />
          {detail(SheetTitle)}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="max-h-[92dvh] gap-0 overflow-y-auto p-0 sm:max-w-3xl"
      >
        {detail(DialogTitle)}
      </DialogContent>
    </Dialog>
  );
};
