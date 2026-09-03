import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHeadCell,
  DataTableHeaderRow,
  DataTableRow,
} from '@/components/common/data-table';
import { ImageIcon } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Switch } from '@/components/ui/switch';
import { fromLocalizedText } from '@/lib/menu/localized';
import { formatAge, formatDuration } from '@/lib/menu/format-age';
import { showError, showSuccess } from '@/lib/ui/toast-helpers';
import { toggleIngredientStopList } from '@/lib/queries/catalog';
import type { OptionStopListItemApi } from '@/lib/queries/catalog';

export interface IngredientStopListTableProps {
  readonly items: readonly OptionStopListItemApi[];
  readonly locationId: string;
}

const STALE_THRESHOLD_MS = 24 * 3_600_000;

export function IngredientStopListTable({
  items,
  locationId,
}: IngredientStopListTableProps): React.ReactElement | null {
  const { t } = useTranslation('translation', { keyPrefix: 'menu.stopList' });
  const { t: tItems } = useTranslation('translation', { keyPrefix: 'menu.items' });
  const queryClient = useQueryClient();
  const [removedIds, setRemovedIds] = React.useState<ReadonlySet<string>>(new Set());

  const toggleMutation = useMutation({
    mutationFn: (optionId: string) => toggleIngredientStopList(optionId, false, locationId),
    onSuccess: (res, optionId) => {
      if (res.ok) {
        setRemovedIds((prev) => {
          const copy = new Set(prev);
          copy.add(optionId);
          return copy;
        });
        showSuccess(tItems('removedFromStopList'), { duration: 1500 });
        void queryClient.invalidateQueries({ queryKey: ['catalog', 'ingredient-stop-list'] });
      } else {
        showError(null, tItems('stopListFailed'));
      }
    },
  });

  const visibleItems = items.filter((it) => !removedIds.has(it.optionId));
  const now = Date.now();

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <DataTable>
      <DataTableHeaderRow>
        <DataTableHeadCell className="w-[48px]">{t('tablePhotoHeader')}</DataTableHeadCell>
        <DataTableHeadCell>{t('tableNameHeader')}</DataTableHeadCell>
        <DataTableHeadCell className="w-[160px]">{t('tableStoppedAtHeader')}</DataTableHeadCell>
        <DataTableHeadCell className="w-[80px] text-right">
          {t('tableStopHeader')}
        </DataTableHeadCell>
      </DataTableHeaderRow>
      <DataTableBody>
        {visibleItems.map((item) => {
          const name = item.optionName ? fromLocalizedText(item.optionName) : '';
          const stoppedAtMs = new Date(item.stoppedAt).getTime();
          const msSince = now - stoppedAtMs;
          const isStale = msSince > STALE_THRESHOLD_MS;
          const isPending = toggleMutation.isPending && toggleMutation.variables === item.optionId;
          return (
            <DataTableRow
              key={item.id}
              className="h-12"
              data-testid={`ingredient-stop-row-${item.optionId}`}
            >
              <DataTableCell>
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt="" className="size-10 rounded object-cover" />
                ) : (
                  <div
                    className="flex size-10 items-center justify-center rounded bg-muted"
                    aria-hidden="true"
                  >
                    <ImageIcon className="size-4 text-muted-foreground" />
                  </div>
                )}
              </DataTableCell>
              <DataTableCell className="font-medium">{name}</DataTableCell>
              <DataTableCell>
                <span className="text-sm">{formatAge(stoppedAtMs, now)}</span>
                {isStale ? (
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                    {t('staleWarning', { duration: formatDuration(msSince) })}
                  </p>
                ) : null}
              </DataTableCell>
              <DataTableCell className="text-right">
                <Switch
                  className="relative after:absolute after:left-1/2 after:top-1/2 after:size-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']"
                  checked
                  disabled={isPending}
                  onCheckedChange={() => {
                    toggleMutation.mutate(item.optionId);
                  }}
                  aria-label={t('resumeAriaLabel', { name })}
                />
              </DataTableCell>
            </DataTableRow>
          );
        })}
      </DataTableBody>
    </DataTable>
  );
}
