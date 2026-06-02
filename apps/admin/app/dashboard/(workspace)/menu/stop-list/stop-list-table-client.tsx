'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { ImageIcon } from 'lucide-react';
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
import { toggleStopListAction } from '../items/toggle-stop-list-action';

export interface StopListItemApi {
  readonly id: string;
  readonly name: Record<string, string>;
  readonly categoryName: Record<string, string>;
  readonly parentCategoryName: Record<string, string> | null;
  readonly photoUrl: string | null;
  readonly stoppedAt: string;
}

export interface StopListTableClientProps {
  readonly items: readonly StopListItemApi[];
}

const STALE_THRESHOLD_MS = 24 * 3_600_000;

const buildCategoryPath = (item: StopListItemApi): string => {
  const child = fromLocalizedText(item.categoryName);
  const parent = item.parentCategoryName ? fromLocalizedText(item.parentCategoryName) : '';
  return parent.length > 0 ? `${parent} → ${child}` : child;
};

export function StopListTableClient({ items }: StopListTableClientProps): React.ReactElement {
  const t = useTranslations('menu.stopList');
  const tItems = useTranslations('menu.items');
  const [pendingIds, setPendingIds] = React.useState<ReadonlySet<string>>(new Set());
  const [removedIds, setRemovedIds] = React.useState<ReadonlySet<string>>(new Set());
  const [, startTransition] = React.useTransition();

  const onToggleOff = (item: StopListItemApi): void => {
    if (pendingIds.has(item.id) || removedIds.has(item.id)) return;
    setPendingIds((prev) => {
      const copy = new Set(prev);
      copy.add(item.id);
      return copy;
    });
    startTransition(async () => {
      const res = await toggleStopListAction({ itemId: item.id, next: 'published' });
      setPendingIds((prev) => {
        const copy = new Set(prev);
        copy.delete(item.id);
        return copy;
      });
      if (res.ok) {
        setRemovedIds((prev) => {
          const copy = new Set(prev);
          copy.add(item.id);
          return copy;
        });
        showSuccess(tItems('removedFromStopList'), { duration: 1500 });
        return;
      }
      showError(res.error, tItems('stopListFailed'));
    });
  };

  const visibleItems = items.filter((it) => !removedIds.has(it.id));
  const now = Date.now();

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
          const name = fromLocalizedText(item.name);
          const categoryPath = buildCategoryPath(item);
          const stoppedAtMs = new Date(item.stoppedAt).getTime();
          const msSince = now - stoppedAtMs;
          const isStale = msSince > STALE_THRESHOLD_MS;
          const isPending = pendingIds.has(item.id);
          return (
            <TableRow key={item.id} className="h-12" data-testid={`stop-row-${item.id}`}>
              <TableCell>
                {item.photoUrl ? (
                  <img src={item.photoUrl} alt="" className="size-10 rounded object-cover" />
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
                  checked
                  disabled={isPending}
                  onCheckedChange={() => {
                    onToggleOff(item);
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
