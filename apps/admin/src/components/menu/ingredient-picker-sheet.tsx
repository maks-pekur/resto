import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ingredientsQuery } from '@/lib/queries/catalog';
import { fromLocalizedText } from '@/lib/menu/localized';
import { useContentLocales } from '@/hooks/use-content-locales';

export interface IngredientPickerSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onPick: (optionId: string) => void;
  readonly showPrice: boolean;
  readonly disabledIds: ReadonlySet<string>;
  readonly disabledReason?: (optionId: string) => string;
}

const trimPrice = (value: string): string => {
  if (value.endsWith('.00')) return value.slice(0, -3);
  if (value.endsWith('.0')) return value.slice(0, -2);
  return value;
};

export function IngredientPickerSheet({
  open,
  onOpenChange,
  onPick,
  showPrice,
  disabledIds,
  disabledReason,
}: IngredientPickerSheetProps): React.ReactElement {
  const { t } = useTranslation('translation', { keyPrefix: 'menu.modifiers' });
  const { defaultLocale } = useContentLocales();
  const { data } = useQuery(ingredientsQuery());
  const [search, setSearch] = React.useState('');

  const ingredients = data?.data?.items ?? [];
  const query = search.trim().toLowerCase();
  const filtered = query
    ? ingredients.filter((ingredient) =>
        fromLocalizedText(ingredient.name, defaultLocale).toLowerCase().includes(query),
      )
    : ingredients;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col gap-4">
        <SheetHeader>
          <SheetTitle className="sr-only">{t('searchPlaceholder')}</SheetTitle>
          <Input
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
            }}
          />
        </SheetHeader>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('sheetEmpty')}</p>
          ) : (
            <ItemGroup>
              {filtered.map((ingredient) => {
                const isDisabled = disabledIds.has(ingredient.id);
                const name = fromLocalizedText(ingredient.name, defaultLocale);
                const priceText =
                  showPrice && Number(ingredient.priceDelta) !== 0
                    ? `+${trimPrice(ingredient.priceDelta)}`
                    : null;
                const pickButton = (
                  <Button
                    type="button"
                    variant={isDisabled ? 'ghost' : 'outline'}
                    size="sm"
                    disabled={isDisabled}
                    onClick={() => {
                      onPick(ingredient.id);
                    }}
                  >
                    {isDisabled ? t('alreadyAdded') : t('addToItem')}
                  </Button>
                );
                return (
                  <Item key={ingredient.id} variant="outline">
                    <ItemMedia variant={ingredient.imageUrl ? 'image' : 'icon'}>
                      {ingredient.imageUrl ? (
                        <img src={ingredient.imageUrl} alt="" />
                      ) : (
                        <ImageIcon className="text-muted-foreground" aria-hidden="true" />
                      )}
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{name}</ItemTitle>
                      {priceText ? <ItemDescription>{priceText}</ItemDescription> : null}
                    </ItemContent>
                    <ItemActions>
                      {isDisabled && disabledReason ? (
                        <TooltipProvider delayDuration={300}>
                          <Tooltip>
                            <TooltipTrigger asChild>{pickButton}</TooltipTrigger>
                            <TooltipContent>{disabledReason(ingredient.id)}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        pickButton
                      )}
                    </ItemActions>
                  </Item>
                );
              })}
            </ItemGroup>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
