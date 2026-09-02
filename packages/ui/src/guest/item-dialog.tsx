'use client';

import { useCallback } from 'react';
import type { MenuItemDto, MenuModifierGroupDto } from '@resto/api-client/public';
import type { CartLineItem } from '@resto/cart';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog';
import { Sheet, SheetContent, SheetTitle } from '../components/ui/sheet';
import { ItemDetail } from './item-detail';
import { useDragToDismiss } from './use-drag-to-dismiss';

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
  const dismiss = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);
  const drag = useDragToDismiss(open && presentation === 'sheet', dismiss);

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
          // On a phone the sheet is dismissed by pulling it down or tapping the page behind it;
          // a close cross floating over the photo is a desktop habit and lands under nothing.
          showCloseButton={false}
          ref={drag.ref}
          // Radix hands focus to the first control, which lands a focus ring on the first size
          // before the guest has touched anything. The panel itself takes it instead.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            (event.currentTarget as HTMLElement | null)?.focus();
          }}
          side="bottom"
          style={{
            transform: drag.offset > 0 ? `translateY(${String(drag.offset)}px)` : undefined,
            transition: drag.dragging ? 'none' : undefined,
          }}
          className="mx-auto max-h-dvh w-full max-w-lg gap-0 overflow-y-auto overscroll-contain rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)] outline-none"
        >
          {/* The grip says the sheet came from the bottom edge and goes back there. It is a whole
              row rather than the bar alone, so the pull starts wherever a thumb lands. */}
          <div aria-hidden className="flex shrink-0 justify-center py-3 touch-none">
            <span className="bg-muted h-1.5 w-12 rounded-full" />
          </div>
          {detail(SheetTitle)}
        </SheetContent>
      </Sheet>
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
