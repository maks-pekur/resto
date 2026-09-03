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
import { modifiersQuery } from '@/lib/queries/catalog';
import { fromLocalizedText } from '@/lib/menu/localized';
import { useContentLocales } from '@/hooks/use-content-locales';

export interface ModifierPickerSheetProps {
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

export function ModifierPickerSheet({
  open,
  onOpenChange,
  onPick,
  showPrice,
  disabledIds,
  disabledReason,
}: ModifierPickerSheetProps): React.ReactElement {
  const { t } = useTranslation('translation', { keyPrefix: 'menu.modifiers' });
  const { defaultLocale } = useContentLocales();
  const { data } = useQuery(modifiersQuery());
  const [search, setSearch] = React.useState('');

  const modifiers = data?.data?.items ?? [];
  const query = search.trim().toLowerCase();
  const filtered = query
    ? modifiers.filter((modifier) =>
        fromLocalizedText(modifier.name, defaultLocale).toLowerCase().includes(query),
      )
    : modifiers;

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
              {filtered.map((modifier) => {
                const isDisabled = disabledIds.has(modifier.id);
                const name = fromLocalizedText(modifier.name, defaultLocale);
                const priceText =
                  showPrice && Number(modifier.priceDelta) !== 0
                    ? `+${trimPrice(modifier.priceDelta)}`
                    : null;
                const pickButton = (
                  <Button
                    type="button"
                    variant={isDisabled ? 'ghost' : 'outline'}
                    size="sm"
                    disabled={isDisabled}
                    onClick={() => {
                      onPick(modifier.id);
                    }}
                  >
                    {isDisabled ? t('alreadyAdded') : t('addToItem')}
                  </Button>
                );
                return (
                  <Item key={modifier.id} variant="outline">
                    <ItemMedia variant={modifier.imageUrl ? 'image' : 'icon'}>
                      {modifier.imageUrl ? (
                        <img src={modifier.imageUrl} alt="" />
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
                            <TooltipContent>{disabledReason(modifier.id)}</TooltipContent>
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
