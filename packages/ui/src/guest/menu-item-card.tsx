'use client';

import type { MenuItemDto } from '@resto/api-client/public';
import { cn } from '../lib/utils';
import { localized } from '../lib/localized';
import { formatPrice } from '../lib/format-price';
import { useGuestUi } from './guest-ui-provider';

const IMAGE_SIZES =
  '(min-width: 1280px) 22vw, (min-width: 1024px) 30vw, (min-width: 640px) 45vw, 90vw';

export interface MenuItemCardProps {
  readonly item: MenuItemDto;
  readonly onSelect: (id: string) => void;
  readonly unavailable?: boolean;
  readonly priority?: boolean;
}

export const MenuItemCard = ({
  item,
  onSelect,
  unavailable = false,
  priority = false,
}: MenuItemCardProps) => {
  const { locale, t, Image } = useGuestUi();

  const name = localized(item.name, locale);
  const description = item.description ? localized(item.description, locale) : null;
  const price = formatPrice(item.basePrice, item.currency, locale);

  return (
    <button
      type="button"
      aria-label={name}
      aria-disabled={unavailable ? 'true' : undefined}
      onClick={() => {
        if (!unavailable) onSelect(item.id);
      }}
      className={cn(
        'group focus-visible:ring-ring flex w-full flex-col rounded-2xl text-left transition-opacity focus-visible:ring-2 focus-visible:ring-offset-4 focus-visible:outline-none',
        unavailable ? 'cursor-not-allowed opacity-45' : 'cursor-pointer',
      )}
    >
      <div className="bg-muted relative aspect-square w-full overflow-hidden rounded-2xl">
        {item.imageUrl ? (
          <Image
            src={item.imageUrl}
            alt=""
            sizes={IMAGE_SIZES}
            priority={priority}
            className={cn(
              'size-full object-cover transition-transform duration-300',
              unavailable ? '' : 'group-hover:scale-105',
            )}
          />
        ) : null}
        {unavailable ? (
          <span className="bg-background/85 text-foreground absolute inset-x-3 bottom-3 rounded-full px-3 py-1.5 text-center text-xs font-bold">
            {t('item.unavailable')}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 px-1 pt-3">
        <h3 className="text-base leading-snug font-extrabold text-balance sm:text-lg">{name}</h3>
        {description ? (
          <p className="text-muted-foreground line-clamp-3 text-sm leading-snug">{description}</p>
        ) : null}

        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          <span className="text-base font-extrabold tabular-nums">
            {item.sizes.length > 0 ? t('item.priceFrom', { price }) : price}
          </span>
          <span
            aria-hidden="true"
            className={cn(
              'bg-primary-tint text-primary-strong inline-flex h-9 items-center rounded-full px-4 text-sm font-bold transition-colors',
              unavailable ? '' : 'group-hover:bg-primary group-hover:text-primary-foreground',
            )}
          >
            {t('item.addToCart')}
          </span>
        </div>
      </div>
    </button>
  );
};
