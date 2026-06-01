'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { MoreHorizontal, ImageIcon } from 'lucide-react';
import { showError, showSuccess, toastFromResult } from '@/lib/ui/toast-helpers';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { StatusBadge } from '@/components/menu/status-badge';
import { fromLocalizedText } from '@/lib/menu/localized';
import type { Status } from '@/lib/menu/types';
import { toggleStopListAction } from './toggle-stop-list-action';
import { archiveItemAction } from './archive-item-action';
import type { ItemListItemApi } from './page';

const PAGE_SIZE_DEFAULT = 50;

export interface ItemsTableClientProps {
  readonly items: readonly ItemListItemApi[];
  readonly totalCount: number;
  readonly pagination: {
    readonly page: number;
    readonly pageSize: number;
  };
}

type OptimisticState = Record<string, 'paused' | 'published' | undefined>;

const formatPrice = (basePrice: string, hasSizes: boolean): string => {
  const trimmed = basePrice.endsWith('.00')
    ? basePrice.slice(0, -3)
    : basePrice.endsWith('.0')
      ? basePrice.slice(0, -2)
      : basePrice;
  return hasSizes ? `от ${trimmed} ₽` : `${trimmed} ₽`;
};

const buildCategoryPath = (item: ItemListItemApi): string => {
  const child = fromLocalizedText(item.categoryName);
  const parent = item.parentCategoryName ? fromLocalizedText(item.parentCategoryName) : '';
  if (parent.length > 0) return `${parent} → ${child}`;
  return child;
};

export function ItemsTableClient({
  items,
  totalCount,
  pagination,
}: ItemsTableClientProps): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [optimistic, setOptimistic] = React.useState<OptimisticState>({});
  const [pendingIds, setPendingIds] = React.useState<ReadonlySet<string>>(new Set());
  const [archiveTarget, setArchiveTarget] = React.useState<ItemListItemApi | null>(null);
  const [openMenuId, setOpenMenuId] = React.useState<string | null>(null);
  const [, startTransition] = React.useTransition();

  const pageSize = pagination.pageSize > 0 ? pagination.pageSize : PAGE_SIZE_DEFAULT;
  const page = pagination.page > 0 ? pagination.page : 1;
  const canGoBack = page > 1;
  const canGoForward = totalCount > page * pageSize;

  const buildPageUrl = (nextPage: number): string => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set('page', String(nextPage));
    return `/dashboard/menu/items?${sp.toString()}`;
  };

  const handleArchiveConfirm = (): void => {
    if (!archiveTarget) return;
    const id = archiveTarget.id;
    setArchiveTarget(null);
    startTransition(async () => {
      const res = await archiveItemAction({ error: null, success: false }, { id });
      toastFromResult(res);
    });
  };

  const handleToggleStop = (item: ItemListItemApi): void => {
    if (pendingIds.has(item.id)) return;
    const currentEffective = optimistic[item.id] ?? item.status;
    const isCurrentlyPaused = currentEffective === 'paused';
    const next: 'paused' | 'published' = isCurrentlyPaused ? 'published' : 'paused';

    setOptimistic((prev) => ({ ...prev, [item.id]: next }));
    setPendingIds((prev) => {
      const copy = new Set(prev);
      copy.add(item.id);
      return copy;
    });

    startTransition(async () => {
      const res = await toggleStopListAction({ itemId: item.id, next });
      setPendingIds((prev) => {
        const copy = new Set(prev);
        copy.delete(item.id);
        return copy;
      });
      if (res.ok) {
        showSuccess(next === 'paused' ? 'Блюдо добавлено в стоп-лист' : 'Блюдо возобновлено', {
          duration: 1500,
        });
      } else {
        setOptimistic((prev) => ({ ...prev, [item.id]: undefined }));
        showError(res.error, 'Could not update the stop list. Please try again.');
      }
    });
  };

  if (items.length === 0) {
    return (
      <EmptyState
        variant="empty"
        title="Блюд пока нет"
        description="Добавьте первое блюдо, чтобы начать заполнять меню."
        action={
          <Link href="/dashboard/menu/items/new">
            <Button>+ Добавить блюдо</Button>
          </Link>
        }
      />
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[48px]" />
            <TableHead>Название</TableHead>
            <TableHead className="w-[100px]">Цена</TableHead>
            <TableHead className="w-[120px]">Статус</TableHead>
            <TableHead className="w-[80px]">Стоп</TableHead>
            <TableHead className="w-[60px] text-right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const name = fromLocalizedText(item.name);
            const categoryPath = buildCategoryPath(item);
            const effectiveStatus: Status = optimistic[item.id] ?? item.status;
            const isOnStopList = effectiveStatus === 'paused';
            const isPending = pendingIds.has(item.id);
            const switchLabel = isOnStopList ? 'Убрать из стоп-листа' : 'Добавить в стоп-лист';

            return (
              <TableRow key={item.id} className="h-12" data-testid={`item-row-${item.id}`}>
                <TableCell>
                  {item.photoUrl ? (
                    // S3 presigned URLs; next/image would proxy each one and add latency.
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
                <TableCell>
                  <Link
                    href={`/dashboard/menu/items/${item.id}`}
                    className="font-medium hover:underline"
                  >
                    {name}
                  </Link>
                  <div className="text-xs text-muted-foreground">{categoryPath}</div>
                </TableCell>
                <TableCell>{formatPrice(item.basePrice, item.hasSizes)}</TableCell>
                <TableCell>
                  <StatusBadge status={effectiveStatus} />
                </TableCell>
                <TableCell>
                  <div className={isPending ? 'pointer-events-none opacity-50' : ''}>
                    <Switch
                      checked={isOnStopList}
                      onCheckedChange={() => {
                        handleToggleStop(item);
                      }}
                      aria-label={switchLabel}
                      disabled={isPending}
                    />
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="relative inline-block">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Действия с блюдом ${name}`}
                      aria-haspopup="menu"
                      aria-expanded={openMenuId === item.id}
                      onClick={() => {
                        setOpenMenuId((prev) => (prev === item.id ? null : item.id));
                      }}
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                    {openMenuId === item.id ? (
                      <div
                        role="menu"
                        className="absolute right-0 z-50 mt-1 min-w-[8rem] rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
                      >
                        <button
                          type="button"
                          role="menuitem"
                          className="flex w-full cursor-default items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                          onClick={() => {
                            setOpenMenuId(null);
                            router.push(`/dashboard/menu/items/${item.id}`);
                          }}
                        >
                          Открыть
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="flex w-full cursor-default items-center rounded-sm px-2 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => {
                            setOpenMenuId(null);
                            setArchiveTarget(item);
                          }}
                        >
                          Архивировать
                        </button>
                      </div>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between pt-2">
        <div className="text-sm text-muted-foreground">Всего: {totalCount}</div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!canGoBack}
            onClick={() => {
              if (canGoBack) router.push(buildPageUrl(page - 1));
            }}
          >
            Назад
          </Button>
          <span className="text-sm text-muted-foreground">Стр. {page}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={!canGoForward}
            onClick={() => {
              if (canGoForward) router.push(buildPageUrl(page + 1));
            }}
          >
            Вперёд
          </Button>
        </div>
      </div>

      <AlertDialog
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Архивировать блюдо?</AlertDialogTitle>
            <AlertDialogDescription>
              {archiveTarget
                ? `Блюдо «${fromLocalizedText(archiveTarget.name)}» будет скрыто из меню. Действие обратимо — снимите архивацию в фильтре статусов.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleArchiveConfirm}>
              Архивировать
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
