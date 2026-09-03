import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ImageIcon } from 'lucide-react';
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHeadCell,
  DataTableHeaderRow,
  DataTableRow,
} from '@/components/common/data-table';
import { EmptyState } from '@/components/common/empty-state';
import { formatMoney } from '@/lib/format/money';
import { fromLocalizedText } from '@/lib/menu/localized';
import { useContentLocales } from '@/hooks/use-content-locales';
import { modifiersQuery } from '@/lib/queries/catalog';
import { tenancyQuery } from '@/lib/queries/tenancy';
import type { ModifierApi } from '@/lib/queries/catalog';

export interface ModifierTableProps {
  readonly onSelect: (modifier: ModifierApi) => void;
  readonly renderStopControl?: (modifier: ModifierApi) => React.ReactNode;
}

export function ModifierTable({
  onSelect,
  renderStopControl,
}: ModifierTableProps): React.ReactElement {
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
    <DataTable>
      <DataTableHeaderRow>
        <DataTableHeadCell className="w-[48px]" />
        <DataTableHeadCell>{t('tableNameHeader')}</DataTableHeadCell>
        <DataTableHeadCell className="w-[100px]">{t('tablePriceHeader')}</DataTableHeadCell>
        <DataTableHeadCell className="w-[100px]">{t('tableGroupsHeader')}</DataTableHeadCell>
        <DataTableHeadCell className="w-[100px]">{t('tableDishesHeader')}</DataTableHeadCell>
        {renderStopControl ? <DataTableHeadCell className="w-[80px] text-right" /> : null}
      </DataTableHeaderRow>
      <DataTableBody>
        {modifiers.map((modifier) => {
          const name = fromLocalizedText(modifier.name, defaultLocale);
          const description = modifier.description
            ? fromLocalizedText(modifier.description, defaultLocale)
            : '';
          const open = (): void => {
            onSelect(modifier);
          };

          return (
            <DataTableRow
              key={modifier.id}
              className="hover:bg-muted/50 focus-visible:bg-muted/50 h-12 cursor-pointer focus-visible:outline-none"
              data-testid={`modifier-row-${modifier.id}`}
              role="button"
              tabIndex={0}
              aria-label={t('rowOpenAriaLabel', { name })}
              onClick={open}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  open();
                }
              }}
            >
              <DataTableCell>
                {modifier.imageUrl ? (
                  <img src={modifier.imageUrl} alt="" className="size-10 rounded object-cover" />
                ) : (
                  <div
                    className="bg-muted flex size-10 items-center justify-center rounded"
                    aria-hidden="true"
                    data-testid={`modifier-photo-placeholder-${modifier.id}`}
                  >
                    <ImageIcon className="text-muted-foreground size-4" />
                  </div>
                )}
              </DataTableCell>
              <DataTableCell>
                <span className="font-medium">{name}</span>
                {description ? (
                  <div className="text-muted-foreground line-clamp-1 text-xs">{description}</div>
                ) : null}
              </DataTableCell>
              <DataTableCell className="tabular-nums">
                {formatMoney(modifier.priceDelta, currency, i18n.language)}
              </DataTableCell>
              <DataTableCell className="text-muted-foreground tabular-nums">
                {modifier.groupCount}
              </DataTableCell>
              <DataTableCell className="text-muted-foreground tabular-nums">
                {modifier.dishCount}
              </DataTableCell>
              {renderStopControl ? (
                <DataTableCell
                  className="text-right"
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                  }}
                >
                  {renderStopControl(modifier)}
                </DataTableCell>
              ) : null}
            </DataTableRow>
          );
        })}
      </DataTableBody>
    </DataTable>
  );
}
