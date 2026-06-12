'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import type { MenuItemDto, MenuModifierGroupDto } from '@resto/api-client/public';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { localized } from '@/lib/i18n/localized';
import type { CartLineItem, CartModifier } from '@/store/cart-types';

interface ItemModalProps {
  item: MenuItemDto | null;
  modifierGroups: readonly MenuModifierGroupDto[];
  currency: string;
  open: boolean;
  onClose: () => void;
  onAddToCart: (lineItem: Omit<CartLineItem, 'quantity'>) => void;
}

export function ItemModal({
  item,
  modifierGroups,
  currency,
  open,
  onClose,
  onAddToCart,
}: ItemModalProps) {
  const locale = useLocale();
  const t = useTranslations('cart');

  const defaultSizeId = item?.sizes.find((s) => s.isDefault)?.id ?? item?.sizes[0]?.id ?? null;
  const [selectedSizeId, setSelectedSizeId] = useState<string | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<Map<string, Set<string>>>(new Map());

  const effectiveSizeId = selectedSizeId ?? defaultSizeId;

  const relevantGroups = useMemo(() => {
    if (!item) return [];
    return modifierGroups.filter((g) => item.modifierGroupIds.includes(g.id));
  }, [item, modifierGroups]);

  const livePrice = useMemo(() => {
    if (!item) return '0';
    let base = parseFloat(item.basePrice);
    if (effectiveSizeId) {
      const size = item.sizes.find((s) => s.id === effectiveSizeId);
      if (size) base = parseFloat(size.price);
    }
    for (const group of relevantGroups) {
      const chosen = selectedOptions.get(group.id);
      if (!chosen) continue;
      for (const opt of group.options) {
        if (chosen.has(opt.id)) base += parseFloat(opt.priceDelta);
      }
    }
    return base.toFixed(2);
  }, [item, effectiveSizeId, relevantGroups, selectedOptions]);

  const toggleOption = (groupId: string, optionId: string, isRadio: boolean) => {
    setSelectedOptions((prev) => {
      const next = new Map(prev);
      const current = new Set(next.get(groupId) ?? []);
      if (isRadio) {
        next.set(groupId, new Set([optionId]));
      } else {
        if (current.has(optionId)) {
          current.delete(optionId);
        } else {
          current.add(optionId);
        }
        next.set(groupId, current);
      }
      return next;
    });
  };

  const handleAddToCart = () => {
    if (!item) return;
    const modifiers: CartModifier[] = [];
    for (const group of relevantGroups) {
      const chosen = selectedOptions.get(group.id);
      if (!chosen) continue;
      for (const opt of group.options) {
        if (chosen.has(opt.id)) {
          modifiers.push({
            optionId: opt.id,
            name: localized(opt.name, locale),
            priceDelta: opt.priceDelta,
            amount: 1,
          });
        }
      }
    }
    const lineItem: Omit<CartLineItem, 'quantity'> = {
      itemId: item.id,
      sizeId: effectiveSizeId,
      name: localized(item.name, locale),
      unitPrice: livePrice,
      currency,
      modifiers,
    };
    onAddToCart(lineItem);
    onClose();
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose();
      setSelectedSizeId(null);
      setSelectedOptions(new Map());
    }
  };

  if (!item) return null;

  const name = localized(item.name, locale);
  const description = item.description ? localized(item.description, locale) : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[560px] p-0 gap-0">
        {item.imageUrl ? (
          <div className="relative h-56 w-full overflow-hidden rounded-t-lg">
            <Image src={item.imageUrl} alt="" fill className="object-cover" />
          </div>
        ) : null}

        <ScrollArea className="max-h-[60vh]">
          <div className="p-6">
            <DialogHeader>
              <DialogTitle className="text-[20px] font-semibold leading-[1.2]">{name}</DialogTitle>
            </DialogHeader>

            {description ? (
              <p className="mt-2 text-[16px] leading-[1.5] text-[oklch(0.45_0_0)]">{description}</p>
            ) : null}

            {item.allergens.length > 0 ? (
              <p className="mt-2 text-[14px] leading-[1.4] text-[oklch(0.45_0_0)]">
                {item.allergens.join(', ')}
              </p>
            ) : null}

            {item.sizes.length > 0 ? (
              <div className="mt-4">
                <p className="mb-2 text-[14px] font-medium leading-[1.4]">Size</p>
                <div className="flex flex-col gap-2">
                  {item.sizes.map((size) => {
                    const sizeLabel = localized(size.name, locale);
                    const isSelected = effectiveSizeId === size.id;
                    return (
                      <label
                        key={size.id}
                        className="flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-colors has-[:checked]:border-[var(--primary,#16a34a)]"
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`size-${item.id}`}
                            value={size.id}
                            checked={isSelected}
                            onChange={() => {
                              setSelectedSizeId(size.id);
                            }}
                            className="accent-[var(--primary,#16a34a)]"
                          />
                          <span className="text-[16px] leading-[1.5]">{sizeLabel}</span>
                        </div>
                        <span
                          className="text-[16px] font-semibold tabular-nums"
                          aria-label={`${size.price} ${currency}`}
                        >
                          {size.price} {currency}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {relevantGroups.map((group) => {
              const isRadio =
                group.minSelectable === 1 && group.maxSelectable === 1 && group.isRequired;
              const groupName = localized(group.name, locale);
              return (
                <div key={group.id} className="mt-4">
                  <p className="mb-2 text-[14px] font-medium leading-[1.4]">{groupName}</p>
                  <div className="flex flex-col gap-2">
                    {group.options.map((opt) => {
                      const optName = localized(opt.name, locale);
                      const chosen = selectedOptions.get(group.id);
                      const isChecked = chosen?.has(opt.id) ?? false;
                      return (
                        <label
                          key={opt.id}
                          className="flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-colors has-[:checked]:border-[var(--primary,#16a34a)]"
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type={isRadio ? 'radio' : 'checkbox'}
                              name={isRadio ? `modifier-${group.id}` : undefined}
                              value={opt.id}
                              checked={isChecked}
                              onChange={() => {
                                toggleOption(group.id, opt.id, isRadio);
                              }}
                              className="accent-[var(--primary,#16a34a)]"
                            />
                            <span className="text-[16px] leading-[1.5]">{optName}</span>
                          </div>
                          {parseFloat(opt.priceDelta) !== 0 ? (
                            <span
                              className="text-[14px] tabular-nums text-[oklch(0.45_0_0)]"
                              aria-label={`${opt.priceDelta} ${currency}`}
                            >
                              +{opt.priceDelta} {currency}
                            </span>
                          ) : null}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <Separator />

        <DialogFooter className="flex items-center justify-between p-6">
          <span
            className="text-[16px] font-semibold tabular-nums"
            aria-label={`${livePrice} ${currency}`}
          >
            {livePrice} {currency}
          </span>
          <Button
            type="button"
            onClick={handleAddToCart}
            className="bg-[var(--primary,#16a34a)] text-white hover:bg-[var(--primary,#16a34a)]/90 min-w-[140px]"
          >
            {t('addToCart')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
