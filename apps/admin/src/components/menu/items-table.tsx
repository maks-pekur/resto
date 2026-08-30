import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, ImageIcon } from 'lucide-react';
import { showError } from '@/lib/ui/toast-helpers';
import { Button } from '@/components/ui/button';
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHeadCell,
  DataTableHeaderRow,
  DataTableRow,
} from '@/components/common/data-table';
import { EmptyState } from '@/components/common/empty-state';
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
import { archiveItem } from '@/lib/queries/catalog';
import type { ItemListItemApi } from '@/lib/queries/catalog';
import type { Status } from '@/lib/menu/types';

const PAGE_SIZE_DEFAULT = 50;

export interface ItemsTableProps {
  readonly items: readonly ItemListItemApi[];
  readonly totalCount: number;
  readonly pagination: {
    readonly page: number;
    readonly pageSize: number;
  };
  readonly onPageChange: (page: number) => void;
}

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

  const [archiveTarget, setArchiveTarget] = React.useState<ItemListItemApi | null>(null);
  const [openMenuId, setOpenMenuId] = React.useState<string | null>(null);

  const openMenuRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (openMenuId === null) return undefined;
    const onPointerDown = (event: PointerEvent): void => {
      const root = openMenuRef.current;
      if (root && event.target instanceof Node && root.contains(event.target)) return;
      setOpenMenuId(null);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpenMenuId(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openMenuId]);

  const archiveMutation = useMutation({
    mutationFn: (id: string) => archiveItem(id),
    onSuccess: (res) => {
      if (res.ok) {
        void queryClient.invalidateQueries({ queryKey: ['catalog', 'items'] });
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

  if (items.length === 0) {
    return (
      <EmptyState
        variant="empty"
        title={t('empty')}
        description={t('emptyDescription')}
        action={
          <Button
            onClick={() => {
              void navigate({
                to: '/menu/items/$id',
                params: { id: 'new' },
              });
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
      <DataTable>
        <DataTableHeaderRow>
          <DataTableHeadCell className="w-[48px]" />
          <DataTableHeadCell>{t('tableNameHeader')}</DataTableHeadCell>
          <DataTableHeadCell className="w-[100px]">{t('tablePriceHeader')}</DataTableHeadCell>
          <DataTableHeadCell className="w-[120px]">{t('tableStatusHeader')}</DataTableHeadCell>
          <DataTableHeadCell className="w-[60px] text-right" />
        </DataTableHeaderRow>
        <DataTableBody>
          {items.map((item) => {
            const name = fromLocalizedText(item.name);
            const categoryPath = buildCategoryPath(item);
            const status: Status = item.status;

            const openItem = (): void => {
              void navigate({
                to: '/menu/items/$id',
                params: { id: item.id },
              });
            };
            const stopPropagation = (e: React.SyntheticEvent): void => {
              e.stopPropagation();
            };

            return (
              <DataTableRow
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
                <DataTableCell>
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
                </DataTableCell>
                <DataTableCell>
                  <span className="font-medium">{name}</span>
                  <div className="text-xs text-muted-foreground">{categoryPath}</div>
                </DataTableCell>
                <DataTableCell>{formatPrice(item.basePrice, item.hasSizes)}</DataTableCell>
                <DataTableCell>
                  <StatusBadge status={status} />
                </DataTableCell>
                <DataTableCell className="text-right" onClick={stopPropagation}>
                  <div
                    className="relative inline-block"
                    ref={openMenuId === item.id ? openMenuRef : undefined}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      className="min-h-11 min-w-11"
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
                </DataTableCell>
              </DataTableRow>
            );
          })}
        </DataTableBody>
      </DataTable>

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
