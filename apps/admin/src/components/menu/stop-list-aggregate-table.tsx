import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { ImageIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { fromLocalizedText } from '@/lib/menu/localized';
import { formatAge } from '@/lib/menu/format-age';
import type { AggregateStopListItemApi } from '@/lib/queries/catalog';

export interface StopListAggregateTableProps {
  readonly items: readonly AggregateStopListItemApi[];
  readonly totalActiveLocations: number;
}

// D-05/D-06: `all` shows every item stopped at ANY location with a per-item
// "stopped at N of M locations" badge; it is READ-ONLY here — stop/unstop
// requires selecting a concrete location (StopListTable, single mode).
export function StopListAggregateTable({
  items,
  totalActiveLocations,
}: StopListAggregateTableProps): React.ReactElement {
  const { t } = useTranslation('translation', { keyPrefix: 'menu.stopList' });
  const now = Date.now();

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground" data-testid="stop-list-readonly-notice">
        {t('aggregateReadOnlyHint')}
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">{t('tablePhotoHeader')}</TableHead>
            <TableHead>{t('tableNameHeader')}</TableHead>
            <TableHead>{t('tableCategoryHeader')}</TableHead>
            <TableHead className="w-40">{t('tableStoppedAtHeader')}</TableHead>
            <TableHead className="w-40 text-right">{t('tableLocationsHeader')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const name = item.itemName ? fromLocalizedText(item.itemName) : '';
            const categoryName = item.categoryName ? fromLocalizedText(item.categoryName) : '';
            const stoppedAtMs = new Date(item.lastStoppedAt).getTime();
            return (
              <TableRow
                key={item.itemId}
                className="h-12"
                data-testid={`stop-aggregate-row-${item.itemId}`}
              >
                <TableCell>
                  <div
                    className="flex size-10 items-center justify-center rounded bg-muted"
                    aria-hidden="true"
                  >
                    <ImageIcon className="size-4 text-muted-foreground" />
                  </div>
                </TableCell>
                <TableCell className="font-medium">{name}</TableCell>
                <TableCell className="text-muted-foreground">{categoryName}</TableCell>
                <TableCell>
                  <span className="text-sm">{formatAge(stoppedAtMs, now)}</span>
                </TableCell>
                <TableCell className="text-right">
                  <Badge
                    variant="secondary"
                    data-testid={`stop-aggregate-badge-${item.itemId}`}
                    aria-label={t('aggregateBadgeAria', {
                      count: item.stoppedLocationCount,
                      total: totalActiveLocations,
                    })}
                  >
                    {t('aggregateBadge', {
                      count: item.stoppedLocationCount,
                      total: totalActiveLocations,
                    })}
                  </Badge>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
