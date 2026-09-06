'use client';

import type {
  MenuItemDto,
  MenuModifierGroupDto,
  MenuModifierOptionDto,
} from '@resto/api-client/public';
import type { CartLineItem } from '@resto/cart';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog';
import { Drawer, DrawerContent, DrawerTitle } from '../components/ui/drawer';
import { ItemDetail } from './item-detail';

export interface ItemDialogProps {
  readonly item: MenuItemDto | null;
  readonly modifierGroups: readonly MenuModifierGroupDto[];
  readonly modifierOptions: readonly MenuModifierOptionDto[];
  readonly stoppedIngredientIds: readonly string[];
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
  modifierOptions,
  stoppedIngredientIds,
  currency,
  open,
  onOpenChange,
  onAddToCart,
  presentation = 'dialog',
}: ItemDialogProps) => {
  if (!item) return null;

  const detail = (Heading: typeof DialogTitle | typeof DrawerTitle) => (
    <ItemDetail
      key={item.id}
      Heading={Heading}
      item={item}
      modifierGroups={modifierGroups}
      modifierOptions={modifierOptions}
      stoppedIngredientIds={stoppedIngredientIds}
      currency={currency}
      onAddToCart={(line) => {
        onAddToCart(line);
        onOpenChange(false);
      }}
    />
  );

  if (presentation === 'sheet') {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={false}>
        <DrawerContent
          // Radix hands focus to the first control, which lands a focus ring on the first size
          // before the guest has touched anything. The panel itself takes it instead.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            (event.currentTarget as HTMLElement | null)?.focus();
          }}
          className="mx-auto w-full max-w-lg pb-[env(safe-area-inset-bottom)] outline-none"
        >
          <div className="overflow-y-auto overscroll-contain">{detail(DrawerTitle)}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement | null)?.focus();
        }}
        className="max-h-[92dvh] gap-0 overflow-y-auto p-0 outline-none sm:max-w-3xl"
      >
        {detail(DialogTitle)}
      </DialogContent>
    </Dialog>
  );
};
