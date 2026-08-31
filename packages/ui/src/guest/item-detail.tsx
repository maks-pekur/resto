'use client';

import type { ElementType } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { MenuItemDto, MenuModifierGroupDto } from '@resto/api-client/public';
import type { CartLineItem } from '@resto/cart';
import { cn } from '../lib/utils';
import { localized } from '../lib/localized';
import { formatPrice } from '../lib/format-price';
import { useGuestUi } from './guest-ui-provider';
import { isSingleChoiceGroup, useItemSelection } from './use-item-selection';

export interface ItemDetailProps {
  readonly item: MenuItemDto;
  readonly modifierGroups: readonly MenuModifierGroupDto[];
  readonly currency: string;
  readonly onAddToCart: (line: Omit<CartLineItem, 'quantity'>) => void;
  readonly onBack?: () => void;
  /** The dialog variant passes shadcn's DialogTitle so the visible heading IS the
   * dialog's accessible name — a second sr-only title would announce twice. */
  readonly Heading?: ElementType;
  readonly className?: string;
}

export const ItemDetail = ({
  item,
  modifierGroups,
  currency,
  onAddToCart,
  onBack,
  Heading = 'h1',
  className,
}: ItemDetailProps) => {
  const { locale, t, Image, defaultContentLocale } = useGuestUi();
  const selection = useItemSelection(item, modifierGroups, locale);

  const name = localized(item.name, locale, defaultContentLocale);
  const description = item.description
    ? localized(item.description, locale, defaultContentLocale)
    : null;

  const handleAdd = (): void => {
    onAddToCart({
      itemId: item.id,
      sizeId: selection.sizeId,
      name,
      unitPrice: selection.livePrice,
      currency,
      photoUrl: item.imageUrl ?? item.photos[0]?.url ?? null,
      modifiers: selection.chosenModifiers,
    });
  };

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex w-fit cursor-pointer items-center gap-2 rounded-full text-sm font-bold transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {t('item.back')}
          </button>
        ) : null}

        <div className="grid gap-6 sm:grid-cols-2 sm:items-start">
          <div className="bg-muted relative aspect-square w-full overflow-hidden rounded-2xl">
            {item.imageUrl ? (
              <Image
                src={item.imageUrl}
                alt=""
                sizes="(min-width: 640px) 45vw, 92vw"
                priority
                className="size-full object-cover"
              />
            ) : null}
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Heading className="text-2xl leading-tight font-extrabold text-balance">
                {name}
              </Heading>
              {description ? (
                <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
              ) : null}
              {item.allergens.length > 0 ? (
                <p className="text-muted-foreground text-xs">
                  {t('item.allergens')}: {item.allergens.join(', ')}
                </p>
              ) : null}
            </div>

            {item.sizes.length > 0 ? (
              <fieldset className="flex flex-col gap-2">
                <legend className="sr-only">{t('item.size')}</legend>
                <div className="bg-muted flex rounded-full p-1">
                  {item.sizes.map((size) => (
                    <label
                      key={size.id}
                      className="has-[:checked]:bg-background has-[:checked]:text-foreground text-muted-foreground has-[:focus-visible]:ring-ring flex-1 cursor-pointer rounded-full px-3 py-2 text-center text-sm font-bold transition-colors has-[:checked]:shadow-sm has-[:focus-visible]:ring-2"
                    >
                      <input
                        type="radio"
                        className="sr-only"
                        name={`size-${item.id}`}
                        value={size.id}
                        checked={selection.sizeId === size.id}
                        onChange={() => {
                          selection.selectSize(size.id);
                        }}
                      />
                      {localized(size.name, locale, defaultContentLocale)}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}

            {modifierGroups.map((group) => {
              const singleChoice = isSingleChoiceGroup(group);
              return (
                <fieldset key={group.id} className="flex flex-col gap-2">
                  <legend className="pb-1 text-sm font-extrabold">
                    {localized(group.name, locale, defaultContentLocale)}
                  </legend>
                  <div className="flex flex-col gap-2">
                    {group.options.map((option) => (
                      <label
                        key={option.id}
                        className="has-[:checked]:border-primary has-[:checked]:bg-primary-tint has-[:focus-visible]:ring-ring flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors has-[:focus-visible]:ring-2"
                      >
                        <span className="flex items-center gap-3 text-sm font-semibold">
                          <input
                            type={singleChoice ? 'radio' : 'checkbox'}
                            className="accent-primary size-4"
                            name={singleChoice ? `modifier-${group.id}` : undefined}
                            value={option.id}
                            checked={selection.isOptionChosen(group.id, option.id)}
                            onChange={() => {
                              selection.toggleOption(group.id, option.id, singleChoice);
                            }}
                          />
                          {localized(option.name, locale, defaultContentLocale)}
                        </span>
                        {Number(option.priceDelta) !== 0 ? (
                          <span className="text-muted-foreground text-sm tabular-nums">
                            +{formatPrice(option.priceDelta, currency, locale)}
                          </span>
                        ) : null}
                      </label>
                    ))}
                  </div>
                </fieldset>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-background sticky bottom-0 flex items-center gap-3 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
        <span className="text-xl font-extrabold tabular-nums">
          {formatPrice(selection.livePrice, currency, locale)}
        </span>
        <button
          type="button"
          onClick={handleAdd}
          className="bg-primary text-primary-foreground focus-visible:ring-ring ml-auto inline-flex h-12 flex-1 cursor-pointer items-center justify-center rounded-full px-6 text-base font-bold transition-transform active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:flex-none sm:min-w-52"
        >
          {t('item.addToCart')}
        </button>
      </div>
    </div>
  );
};
