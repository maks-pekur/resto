import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ImageIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/common/empty-state';
import { formatMoney } from '@/lib/format/money';
import { fromLocalizedText } from '@/lib/menu/localized';
import { useContentLocales } from '@/hooks/use-content-locales';
import { ingredientsQuery } from '@/lib/queries/catalog';
import { tenancyQuery } from '@/lib/queries/tenancy';
import type { IngredientApi } from '@/lib/queries/catalog';

export interface IngredientCardGridProps {
  readonly onSelect: (ingredient: IngredientApi) => void;
  readonly renderStopControl?: (ingredient: IngredientApi) => React.ReactNode;
}

export function IngredientCardGrid({
  onSelect,
  renderStopControl,
}: IngredientCardGridProps): React.ReactElement {
  const { t, i18n } = useTranslation('translation', { keyPrefix: 'menu.ingredients' });
  const { defaultLocale } = useContentLocales();
  const { data } = useQuery(ingredientsQuery());
  const { data: tenantResult } = useQuery(tenancyQuery());
  const currency = tenantResult?.data?.defaultCurrency ?? 'RUB';
  const ingredients = data?.data?.items ?? [];

  if (ingredients.length === 0) {
    return (
      <EmptyState variant="empty" title={t('emptyTitle')} description={t('emptyDescription')} />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {ingredients.map((ingredient) => {
        const name = fromLocalizedText(ingredient.name, defaultLocale);
        return (
          <Card
            key={ingredient.id}
            data-testid={`ingredient-card-${ingredient.id}`}
            role="button"
            tabIndex={0}
            className="cursor-pointer gap-0 overflow-hidden py-0 hover:shadow-md"
            onClick={() => {
              onSelect(ingredient);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSelect(ingredient);
            }}
          >
            <div className="relative aspect-square bg-muted">
              {ingredient.imageUrl ? (
                <img src={ingredient.imageUrl} alt="" className="size-full object-cover" />
              ) : (
                <div
                  className="flex size-full items-center justify-center"
                  aria-hidden="true"
                  data-testid={`ingredient-photo-placeholder-${ingredient.id}`}
                >
                  <ImageIcon className="size-6 text-muted-foreground" />
                </div>
              )}
              {renderStopControl ? (
                <div className="absolute top-2 right-2">{renderStopControl(ingredient)}</div>
              ) : null}
            </div>
            <div className="flex flex-col gap-0.5 px-3 pt-2 pb-3">
              <p className="line-clamp-1 text-sm font-semibold">{name}</p>
              <p className="text-sm font-normal text-muted-foreground tabular-nums">
                {formatMoney(ingredient.priceDelta, currency, i18n.language)}
              </p>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
