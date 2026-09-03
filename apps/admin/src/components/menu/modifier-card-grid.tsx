import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ImageIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/common/empty-state';
import { formatMoney } from '@/lib/format/money';
import { fromLocalizedText } from '@/lib/menu/localized';
import { useContentLocales } from '@/hooks/use-content-locales';
import { modifiersQuery } from '@/lib/queries/catalog';
import { tenancyQuery } from '@/lib/queries/tenancy';
import type { ModifierApi } from '@/lib/queries/catalog';

export interface ModifierCardGridProps {
  readonly onSelect: (modifier: ModifierApi) => void;
  readonly renderStopControl?: (modifier: ModifierApi) => React.ReactNode;
}

export function ModifierCardGrid({
  onSelect,
  renderStopControl,
}: ModifierCardGridProps): React.ReactElement {
  const { t, i18n } = useTranslation('translation', { keyPrefix: 'menu.modifiers' });
  const { defaultLocale } = useContentLocales();
  const { data } = useQuery(modifiersQuery());
  const { data: tenantResult } = useQuery(tenancyQuery());
  const currency = tenantResult?.data?.defaultCurrency ?? 'RUB';
  const modifiers = data?.data?.items ?? [];

  if (modifiers.length === 0) {
    return (
      <EmptyState variant="empty" title={t('emptyTitle')} description={t('emptyDescription')} />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {modifiers.map((modifier) => {
        const name = fromLocalizedText(modifier.name, defaultLocale);
        return (
          <Card
            key={modifier.id}
            data-testid={`modifier-card-${modifier.id}`}
            role="button"
            tabIndex={0}
            className="cursor-pointer gap-0 overflow-hidden py-0 hover:shadow-md"
            onClick={() => {
              onSelect(modifier);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSelect(modifier);
            }}
          >
            <div className="relative aspect-square bg-muted">
              {modifier.imageUrl ? (
                <img src={modifier.imageUrl} alt="" className="size-full object-cover" />
              ) : (
                <div
                  className="flex size-full items-center justify-center"
                  aria-hidden="true"
                  data-testid={`modifier-photo-placeholder-${modifier.id}`}
                >
                  <ImageIcon className="size-6 text-muted-foreground" />
                </div>
              )}
              {renderStopControl ? (
                <div
                  className="absolute top-2 right-2"
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                  }}
                >
                  {renderStopControl(modifier)}
                </div>
              ) : null}
            </div>
            <div className="flex flex-col gap-0.5 px-3 pt-2 pb-3">
              <p className="line-clamp-1 text-sm font-semibold">{name}</p>
              <p className="text-sm font-normal text-muted-foreground tabular-nums">
                {formatMoney(modifier.priceDelta, currency, i18n.language)}
              </p>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
