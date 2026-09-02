'use client';

import type { MenuItemDto } from '@resto/api-client/public';
import { cn } from '../lib/utils';
import { localized } from '../lib/localized';
import { useEffect, useRef, useState } from 'react';
import { formatPrice } from '../lib/format-price';
import { CheckIcon } from '../icons';
import { DietMarks } from './diet-marks';
import { useGuestUi } from './guest-ui-provider';

const IMAGE_SIZES =
  '(min-width: 1280px) 22vw, (min-width: 1024px) 30vw, (min-width: 640px) 45vw, 50vw';

export interface MenuItemCardProps {
  readonly item: MenuItemDto;
  readonly onSelect: (id: string) => void;
  /** Adds the item as it stands — offered only when there is nothing left to choose. */
  readonly onQuickAdd?: (item: MenuItemDto) => void;
  readonly unavailable?: boolean;
  readonly priority?: boolean;
}

/** The lowest a guest can pay for this dish: the cheapest size, or the base price. */
const lowestPrice = (item: MenuItemDto): string =>
  item.sizes.reduce(
    (lowest, size) => (Number(size.price) < Number(lowest) ? size.price : lowest),
    item.sizes[0]?.price ?? item.basePrice,
  );

const ADDED_FOR_MS = 1_400;

export const MenuItemCard = ({
  item,
  onSelect,
  onQuickAdd,
  unavailable = false,
  priority = false,
}: MenuItemCardProps) => {
  const { locale, t, Image, defaultContentLocale } = useGuestUi();

  const [justAdded, setJustAdded] = useState(false);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (addedTimer.current !== null) clearTimeout(addedTimer.current);
    },
    [],
  );

  const name = localized(item.name, locale, defaultContentLocale);
  const description = item.description
    ? localized(item.description, locale, defaultContentLocale)
    : null;
  // Nothing to choose means nothing to open: the card can put the dish straight in the cart.
  const hasChoices = item.sizes.length > 0 || item.modifierGroupIds.length > 0;
  const price = formatPrice(hasChoices ? lowestPrice(item) : item.basePrice, item.currency, locale);
  const priceLabel = item.sizes.length > 0 ? t('item.priceFrom', { price }) : price;

  const open = (): void => {
    if (!unavailable) onSelect(item.id);
  };

  return (
    // h-full + the growing top half: every card in a row ends at the same line, with the price
    // pinned to it however short the name is.
    <div className={cn('group flex h-full w-full flex-col', unavailable && 'opacity-45')}>
      <button
        type="button"
        aria-label={name}
        aria-disabled={unavailable ? 'true' : undefined}
        onClick={open}
        className={cn(
          'focus-visible:ring-ring flex w-full flex-1 flex-col rounded-2xl text-start transition-opacity focus-visible:ring-2 focus-visible:ring-offset-4 focus-visible:outline-none',
          unavailable ? 'cursor-not-allowed' : 'cursor-pointer',
        )}
      >
        <div className="bg-muted relative aspect-square w-full shrink-0 overflow-hidden rounded-2xl">
          {item.imageUrl ? (
            <Image
              src={item.imageUrl}
              alt=""
              sizes={IMAGE_SIZES}
              priority={priority}
              className={cn(
                'size-full object-cover transition-transform duration-300',
                unavailable ? '' : 'sm:group-hover:scale-105',
              )}
            />
          ) : null}
          {unavailable ? (
            <span className="bg-background/85 text-foreground absolute inset-x-1.5 bottom-1.5 rounded-full px-2 py-1 text-center text-[0.6875rem] leading-tight font-bold sm:inset-x-3 sm:bottom-3 sm:px-3 sm:py-1.5 sm:text-xs">
              {t('item.unavailable')}
            </span>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1 px-1 pt-2 pb-2 sm:pt-3 sm:pb-3">
          <h3 className="text-center text-[0.8125rem] leading-snug font-extrabold text-balance xs:text-sm sm:text-lg">
            {name}
            <DietMarks diets={item.diets} />
          </h3>
          {description ? (
            <p className="text-muted-foreground line-clamp-2 text-xs leading-snug sm:line-clamp-3 sm:text-sm">
              {description}
            </p>
          ) : null}
        </div>
      </button>

      <button
        type="button"
        disabled={unavailable}
        aria-label={
          hasChoices ? t('item.choose', { name }) : t('item.addNamed', { name, price: priceLabel })
        }
        onClick={() => {
          if (unavailable) return;
          if (hasChoices || !onQuickAdd) {
            open();
            return;
          }
          onQuickAdd(item);
          // The cart is a tab away at the bottom of the screen: without a beat of confirmation
          // here, a tap that worked and a tap that missed look exactly the same.
          setJustAdded(true);
          if (addedTimer.current !== null) clearTimeout(addedTimer.current);
          addedTimer.current = setTimeout(() => {
            setJustAdded(false);
          }, ADDED_FOR_MS);
        }}
        className={cn(
          'focus-visible:ring-ring mx-1 mt-auto inline-flex h-9 shrink-0 items-center justify-center gap-1 rounded-full px-3 text-sm font-extrabold tabular-nums transition-all focus-visible:ring-2 focus-visible:outline-none',
          justAdded ? 'bg-primary text-primary-foreground' : 'bg-primary-tint text-primary-strong',
          unavailable
            ? 'cursor-not-allowed'
            : 'hover:bg-primary hover:text-primary-foreground cursor-pointer active:scale-95',
        )}
      >
        {justAdded ? (
          <>
            <CheckIcon aria-hidden className="size-4" />
            {t('item.added')}
          </>
        ) : (
          priceLabel
        )}
      </button>
    </div>
  );
};
