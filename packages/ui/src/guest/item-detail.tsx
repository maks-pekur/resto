'use client';

import { useMemo, type ElementType } from 'react';
import { ArrowLeft } from 'lucide-react';
import type {
  MenuItemDto,
  MenuModifierGroupDto,
  MenuModifierOptionDto,
} from '@resto/api-client/public';
import type { CartLineItem } from '@resto/cart';
import { cn } from '../lib/utils';
import { localized } from '../lib/localized';
import { formatPrice } from '../lib/format-price';
import { XIcon } from '../icons';
import { useGuestUi } from './guest-ui-provider';
import { SegmentedChoice } from './segmented-choice';
import { hasNutrition, NutritionInfo } from './nutrition-info';
import { useItemSelection } from './use-item-selection';
import { IngredientTile } from './ingredient-tile';
import { PillMultiChoice } from './pill-multi-choice';

export interface ItemDetailProps {
  readonly item: MenuItemDto;
  readonly modifierGroups: readonly MenuModifierGroupDto[];
  readonly modifierOptions: readonly MenuModifierOptionDto[];
  readonly stoppedIngredientIds?: readonly string[];
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
  modifierOptions,
  stoppedIngredientIds = [],
  currency,
  onAddToCart,
  onBack,
  Heading = 'h1',
  className,
}: ItemDetailProps) => {
  const { locale, t, Image, defaultContentLocale } = useGuestUi();
  const optionsById = useMemo(
    () => new Map(modifierOptions.map((option) => [option.id, option])),
    [modifierOptions],
  );
  const stoppedIds = useMemo(() => new Set(stoppedIngredientIds), [stoppedIngredientIds]);
  const selection = useItemSelection(item, modifierGroups, locale, optionsById);

  const name = localized(item.name, locale, defaultContentLocale);
  const description = item.description
    ? localized(item.description, locale, defaultContentLocale)
    : null;

  const compositionLines = useMemo(
    () =>
      item.compositionLines
        .map((line) => {
          const option = optionsById.get(line.optionId);
          if (!option) return null;
          return {
            optionId: line.optionId,
            removable: line.removable,
            name: localized(option.name, locale, defaultContentLocale),
          };
        })
        .filter((line): line is NonNullable<typeof line> => line !== null),
    [item.compositionLines, optionsById, locale, defaultContentLocale],
  );

  const [firstUnmet] = selection.unmetGroups;

  const handleAdd = (): void => {
    const size = item.sizes.find((candidate) => candidate.id === selection.sizeId);
    onAddToCart({
      itemId: item.id,
      sizeId: selection.sizeId,
      sizeName: size ? localized(size.name, locale, defaultContentLocale) : null,
      name,
      unitPrice: selection.livePrice,
      currency,
      imageUrl: item.imageUrl ?? item.photos[0]?.url ?? null,
      modifiers: [...selection.chosenModifiers, ...selection.excludedModifiers],
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

          <div className="flex flex-col gap-2">
            <div className="mb-2 flex flex-col gap-2">
              <div className="flex items-start gap-3">
                <Heading className="min-w-0 flex-1 text-2xl leading-tight font-extrabold text-balance">
                  {name}
                </Heading>
                {/* `ms-auto` rather than a right edge: in Arabic the end of the line is the left. */}
                {hasNutrition(item) ? (
                  <NutritionInfo item={item} className="mt-1.5 ms-auto" />
                ) : null}
              </div>
              {description ? (
                <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
              ) : null}
              {item.compositionMode === 'assembled' && compositionLines.length > 0 ? (
                <p className="text-muted-foreground flex flex-wrap items-baseline gap-x-1 text-sm">
                  <span className="font-semibold">{t('item.composition')}:</span>
                  {compositionLines.map((line, index) => {
                    const excluded = selection.excludedOptionIds.has(line.optionId);
                    return (
                      <span key={line.optionId} className="inline-flex items-baseline">
                        {line.removable ? (
                          <button
                            type="button"
                            aria-pressed={excluded}
                            aria-label={t(
                              excluded
                                ? 'item.compositionIncludeAriaLabel'
                                : 'item.compositionExcludeAriaLabel',
                              { name: line.name },
                            )}
                            onClick={() => {
                              selection.toggleExclusion(line.optionId);
                            }}
                            className={cn(
                              'focus-visible:ring-ring inline-flex cursor-pointer items-center gap-0.5 rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none',
                              excluded
                                ? 'text-muted-foreground/70 line-through'
                                : 'text-foreground',
                            )}
                          >
                            <XIcon
                              aria-hidden
                              className={cn(
                                'size-3',
                                excluded ? 'text-foreground' : 'text-muted-foreground',
                              )}
                            />
                            {line.name}
                          </button>
                        ) : (
                          <span>{line.name}</span>
                        )}
                        {index < compositionLines.length - 1 ? <span aria-hidden>,</span> : null}
                      </span>
                    );
                  })}
                </p>
              ) : null}
              {item.compositionMode === 'text' && item.composition.length > 0 ? (
                <p className="text-muted-foreground text-sm">
                  <span className="font-semibold">{t('item.composition')}:</span>{' '}
                  {item.composition.join(', ')}
                </p>
              ) : null}
              {item.allergens.length > 0 ? (
                // Named through the same dictionary the filters use, so "milk" reads as one word
                // in every language the menu speaks.
                <p className="text-muted-foreground text-xs">
                  {t('item.allergens')}:{' '}
                  {item.allergens.map((allergen) => t(`allergen.${allergen}`)).join(', ')}
                </p>
              ) : null}
            </div>

            {item.sizes.length > 0 ? (
              <fieldset>
                <legend className="sr-only">{t('item.size')}</legend>
                <SegmentedChoice
                  name={`size-${item.id}`}
                  selectedId={selection.sizeId}
                  onSelect={selection.selectSize}
                  options={item.sizes.map((size) => ({
                    id: size.id,
                    label: localized(size.name, locale, defaultContentLocale),
                  }))}
                />
              </fieldset>
            ) : null}

            {modifierGroups.map((group) => {
              const groupName = localized(group.name, locale, defaultContentLocale);
              const groupOptions = group.optionIds
                .map((optionId) => optionsById.get(optionId))
                .filter((option): option is MenuModifierOptionDto => option !== undefined);
              const priceNoteFor = (option: MenuModifierOptionDto): string | null =>
                Number(option.priceDelta) === 0
                  ? null
                  : `+${formatPrice(option.priceDelta, currency, locale)}`;

              if (group.display === 'tiles') {
                return (
                  <fieldset key={group.id} className="flex flex-col gap-2">
                    <legend className="pb-1 text-sm font-extrabold">{groupName}</legend>
                    <div className="grid grid-cols-3 gap-1.5 xs:gap-2">
                      {groupOptions.map((option) => (
                        <IngredientTile
                          key={option.id}
                          type={group.behaviour === 'one' ? 'radio' : 'checkbox'}
                          name={`modifier-${group.id}`}
                          id={option.id}
                          label={localized(option.name, locale, defaultContentLocale)}
                          description={
                            option.description
                              ? localized(option.description, locale, defaultContentLocale)
                              : null
                          }
                          imageUrl={option.imageUrl}
                          priceLabel={priceNoteFor(option)}
                          selected={selection.isOptionChosen(group.id, option.id)}
                          unavailable={stoppedIds.has(option.id)}
                          onToggle={() => {
                            selection.toggleOption(group.id, option.id, group.behaviour === 'one');
                          }}
                        />
                      ))}
                    </div>
                  </fieldset>
                );
              }

              // display === 'tabs' here — the 'tiles' branch above already returned.
              if (group.behaviour === 'several') {
                return (
                  <fieldset key={group.id} className="flex flex-col gap-2">
                    <legend className="pb-1 text-sm font-extrabold">{groupName}</legend>
                    <PillMultiChoice
                      name={`modifier-${group.id}`}
                      options={groupOptions.map((option) => ({
                        id: option.id,
                        label: localized(option.name, locale, defaultContentLocale),
                        note: priceNoteFor(option),
                      }))}
                      selectedIds={
                        new Set(
                          groupOptions
                            .filter((option) => selection.isOptionChosen(group.id, option.id))
                            .map((option) => option.id),
                        )
                      }
                      unavailableIds={stoppedIds}
                      onToggle={(optionId) => {
                        selection.toggleOption(group.id, optionId, false);
                      }}
                    />
                  </fieldset>
                );
              }

              // display === 'tabs' && behaviour === 'one' — the only remaining combination; wears
              // the same single-answer control the sizes use, so it needs no heading above it.
              return (
                <fieldset key={group.id}>
                  <legend className="sr-only">{groupName}</legend>
                  <SegmentedChoice
                    name={`modifier-${group.id}`}
                    selectedId={
                      groupOptions.find((option) => selection.isOptionChosen(group.id, option.id))
                        ?.id ?? null
                    }
                    onSelect={(optionId) => {
                      selection.toggleOption(group.id, optionId, true);
                    }}
                    options={groupOptions.map((option) => ({
                      id: option.id,
                      label: localized(option.name, locale, defaultContentLocale),
                      note: priceNoteFor(option),
                    }))}
                  />
                </fieldset>
              );
            })}
          </div>
        </div>
      </div>

      {/* Glass, so the dish keeps scrolling under the one control that ends the visit. */}
      <div className="bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky bottom-0 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur sm:px-6">
        {/* The server refuses an order with an unanswered required group; better to say so here
            than at checkout. */}
        {firstUnmet === undefined ? null : (
          <p className="text-muted-foreground mb-2 text-center text-xs">
            {t('item.chooseFirst', {
              group: localized(firstUnmet.name, locale, defaultContentLocale),
            })}
          </p>
        )}
        <button
          type="button"
          onClick={handleAdd}
          disabled={firstUnmet !== undefined}
          className="bg-primary text-primary-foreground focus-visible:ring-ring flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full px-5 text-base font-bold transition-transform active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span>{t('item.addToCart')}</span>
          <span className="tabular-nums">{formatPrice(selection.livePrice, currency, locale)}</span>
        </button>
      </div>
    </div>
  );
};
