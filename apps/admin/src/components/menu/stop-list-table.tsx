import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/common/empty-state';
import { ImageIcon } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { fromLocalizedText } from '@/lib/menu/localized';
import { formatAge, formatDuration } from '@/lib/menu/format-age';
import { showError, showSuccess } from '@/lib/ui/toast-helpers';
import { toggleStopList } from '@/lib/queries/catalog';
import type { StopListItemApi } from '@/lib/queries/catalog';

export interface StopListTableProps {
  readonly items: readonly StopListItemApi[];
  readonly locationId: string;
}

const STALE_THRESHOLD_MS = 24 * 3_600_000;

// The stop-list contract carries only the item's own category, not its parent — unlike
// the item list, which carries both. Rendering a parent segment here read a field the
// response never had.
const buildCategoryPath = (item: StopListItemApi): string =>
  item.categoryName ? fromLocalizedText(item.categoryName) : '';

export function StopListTable({ items, locationId }: StopListTableProps): React.ReactElement {
  const { t } = useTranslation('translation', { keyPrefix: 'menu.stopList' });
  const { t: tItems } = useTranslation('translation', { keyPrefix: 'menu.items' });
  const queryClient = useQueryClient();
  const [removedIds, setRemovedIds] = React.useState<ReadonlySet<string>>(new Set());

  const toggleMutation = useMutation({
    mutationFn: (itemId: string) => toggleStopList(itemId, 'published', locationId),
    onSuccess: (res, itemId) => {
      if (res.ok) {
        setRemovedIds((prev) => {
          const copy = new Set(prev);
          copy.add(itemId);
          return copy;
        });
        showSuccess(tItems('removedFromStopList'), { duration: 1500 });
        void queryClient.invalidateQueries({ queryKey: ['catalog', 'stop-list'] });
      } else {
        showError(null, tItems('stopListFailed'));
      }
    },
  });

  const visibleItems = items.filter((it) => !removedIds.has(it.id));
  const now = Date.now();

  if (visibleItems.length === 0) {
    return <EmptyState variant="empty" title={t('title')} description={t('titleDescription')} />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[48px]">{t('tablePhotoHeader')}</TableHead>
          <TableHead>{t('tableNameHeader')}</TableHead>
          <TableHead>{t('tableCategoryHeader')}</TableHead>
          <TableHead className="w-[160px]">{t('tableStoppedAtHeader')}</TableHead>
          <TableHead className="w-[80px] text-right">{t('tableStopHeader')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {visibleItems.map((item) => {
          const name = item.itemName ? fromLocalizedText(item.itemName) : '';
          const categoryPath = buildCategoryPath(item);
          const stoppedAtMs = new Date(item.stoppedAt).getTime();
          const msSince = now - stoppedAtMs;
          const isStale = msSince > STALE_THRESHOLD_MS;
          const isPending = toggleMutation.isPending && toggleMutation.variables === item.id;
          return (
            <TableRow key={item.id} className="h-12" data-testid={`stop-row-${item.id}`}>
              <TableCell>
                {item.photo ? (
                  <img src={item.photo.url} alt="" className="size-10 rounded object-cover" />
                ) : (
                  <div
                    className="flex size-10 items-center justify-center rounded bg-muted"
                    aria-hidden="true"
                  >
                    <ImageIcon className="size-4 text-muted-foreground" />
                  </div>
                )}
              </TableCell>
              <TableCell className="font-medium">{name}</TableCell>
              <TableCell className="text-muted-foreground">{categoryPath}</TableCell>
              <TableCell>
                <span className="text-sm">{formatAge(stoppedAtMs, now)}</span>
                {isStale ? (
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                    {t('staleWarning', { duration: formatDuration(msSince) })}
                  </p>
                ) : null}
              </TableCell>
              <TableCell className="text-right">
                <Switch
                  className="relative after:absolute after:left-1/2 after:top-1/2 after:size-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']"
                  checked
                  disabled={isPending}
                  onCheckedChange={() => {
                    toggleMutation.mutate(item.id);
                  }}
                  aria-label={t('resumeAriaLabel', { name })}
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
