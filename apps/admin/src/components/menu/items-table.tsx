import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, ImageIcon } from 'lucide-react';
import { showError, showSuccess } from '@/lib/ui/toast-helpers';
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
import { toggleStopList, archiveItem } from '@/lib/queries/catalog';
import type { ItemListItemApi } from '@/lib/queries/catalog';
import type { Status } from '@/lib/menu/types';

const PAGE_SIZE_DEFAULT = 50;

export interface ItemsTableProps {
  readonly brandSlug: string;
  readonly items: readonly ItemListItemApi[];
  readonly totalCount: number;
  readonly pagination: {
    readonly page: number;
    readonly pageSize: number;
  };
  readonly onPageChange: (page: number) => void;
}

type OptimisticState = Record<string, 'paused' | 'published' | undefined>;

const trimPrice = (basePrice: string): string => {
  if (basePrice.endsWith('.00')) return basePrice.slice(0, -3);
  if (basePrice.endsWith('.0')) return basePrice.slice(0, -2);
  return basePrice;
};

const buildCategoryPath = (item: ItemListItemApi): string => {
  const child = fromLocalizedText(item.categoryName);
  const parent = item.parentCategoryName ? fromLocalizedText(item.parentCategoryName) : '';
  if (parent.length > 0) return `${parent} → ${child}`;
  return child;
};

export function ItemsTable({
  brandSlug,
  items,
  totalCount,
  pagination,
  onPageChange,
}: ItemsTableProps): React.ReactElement {
  const navigate = useNavigate();
  const { t } = useTranslation('translation', { keyPrefix: 'menu.items' });
  const { t: tCommon } = useTranslation('translation', { keyPrefix: 'common' });
  const queryClient = useQueryClient();

  const formatPrice = (basePrice: string, hasSizes: boolean): string => {
    const trimmed = trimPrice(basePrice);
    return hasSizes ? t('fromPrice', { price: trimmed }) : t('withCurrency', { price: trimmed });
  };

  const [optimistic, setOptimistic] = React.useState<OptimisticState>({});
  const [pendingIds, setPendingIds] = React.useState<ReadonlySet<string>>(new Set());
  const [archiveTarget, setArchiveTarget] = React.useState<ItemListItemApi | null>(null);
  const [openMenuId, setOpenMenuId] = React.useState<string | null>(null);

  const toggleMutation = useMutation({
    mutationFn: ({ itemId, next }: { itemId: string; next: 'paused' | 'published' }) =>
      toggleStopList(brandSlug, itemId, next),
    onSettled: (_data, _err, { itemId }) => {
      setPendingIds((prev) => {
        const copy = new Set(prev);
        copy.delete(itemId);
        return copy;
      });
    },
    onSuccess: (res, { itemId, next }) => {
      if (res.ok) {
        showSuccess(next === 'paused' ? t('addedToStopList') : t('removedFromStopList'), {
          duration: 1500,
        });
        void queryClient.invalidateQueries({ queryKey: ['catalog', 'stop-list', brandSlug] });
      } else {
        setOptimistic((prev) => ({ ...prev, [itemId]: undefined }));
        showError(null, t('stopListFailed'));
      }
    },
    onError: (_err, { itemId }) => {
      setOptimistic((prev) => ({ ...prev, [itemId]: undefined }));
      showError(null, t('stopListFailed'));
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => archiveItem(brandSlug, id),
    onSuccess: (res) => {
      if (res.ok) {
        void queryClient.invalidateQueries({ queryKey: ['catalog', 'items', brandSlug] });
      } else {
        showError(null, t('archiveFailed'));
      }
    },
  });

  const pageSize = pagination.pageSize > 0 ? pagination.pageSize : PAGE_SIZE_DEFAULT;
  const page = pagination.page > 0 ? pagination.page : 1;
  const canGoBack = page > 1;
  const canGoForward = totalCount > page * pageSize;

  const handleArchiveConfirm = (): void => {
    if (!archiveTarget) return;
    const id = archiveTarget.id;
    setArchiveTarget(null);
    archiveMutation.mutate(id);
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
    toggleMutation.mutate({ itemId: item.id, next });
  };

  if (items.length === 0) {
    return (
      <EmptyState
        variant="empty"
        title={t('empty')}
        description={t('emptyDescription')}
        action={
          <Button
            onClick={() => {
              /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call */
              void (navigate as any)({
                to: '/dashboard/$brandSlug/menu/items/$id',
                params: { brandSlug, id: 'new' },
              });
              /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call */
            }}
          >
            {t('addItem')}
          </Button>
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
            <TableHead>{t('tableNameHeader')}</TableHead>
            <TableHead className="w-[100px]">{t('tablePriceHeader')}</TableHead>
            <TableHead className="w-[120px]">{t('tableStatusHeader')}</TableHead>
            <TableHead className="w-[80px]">{t('tableStopHeader')}</TableHead>
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
            const switchLabel = isOnStopList ? t('stopSwitchOff') : t('stopSwitchOn');

            const openItem = (): void => {
              /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call */
              void (navigate as any)({
                to: '/dashboard/$brandSlug/menu/items/$id',
                params: { brandSlug, id: item.id },
              });
              /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call */
            };
            const stopPropagation = (e: React.SyntheticEvent): void => {
              e.stopPropagation();
            };

            return (
              <TableRow
                key={item.id}
                className="h-12 cursor-pointer hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                data-testid={`item-row-${item.id}`}
                role="button"
                tabIndex={0}
                aria-label={t('rowOpenAriaLabel', { name })}
                onClick={openItem}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    openItem();
                  }
                }}
              >
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
                <TableCell>
                  <span className="font-medium">{name}</span>
                  <div className="text-xs text-muted-foreground">{categoryPath}</div>
                </TableCell>
                <TableCell>{formatPrice(item.basePrice, item.hasSizes)}</TableCell>
                <TableCell>
                  <StatusBadge status={effectiveStatus} />
                </TableCell>
                <TableCell onClick={stopPropagation}>
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
                <TableCell className="text-right" onClick={stopPropagation}>
                  <div className="relative inline-block">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('actionsAriaLabel', { name })}
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
                            openItem();
                          }}
                        >
                          {t('openAction')}
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
                          {t('archiveAction')}
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
        <div className="text-sm text-muted-foreground">
          {t('totalLabel', { total: totalCount })}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!canGoBack}
            onClick={() => {
              if (canGoBack) onPageChange(page - 1);
            }}
          >
            {tCommon('back')}
          </Button>
          <span className="text-sm text-muted-foreground">{t('pageLabel', { page })}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={!canGoForward}
            onClick={() => {
              if (canGoForward) onPageChange(page + 1);
            }}
          >
            {tCommon('next')}
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
            <AlertDialogTitle>{t('archiveDialogTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {archiveTarget
                ? t('archiveDialogDescription', {
                    name: fromLocalizedText(archiveTarget.name),
                  })
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleArchiveConfirm}>
              {t('archiveAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
