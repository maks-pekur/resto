import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, GripVertical, Pencil } from 'lucide-react';
import {
  DndContext,
  type DragCancelEvent,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
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
import { EmptyState } from '@/components/common/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { fromLocalizedText } from '@/lib/menu/localized';
import { cn } from '@/lib/utils';
import { showError } from '@/lib/ui/toast-helpers';
import { archiveCategory, reorderCategories } from '@/lib/queries/catalog';
import { CategoryForm } from '@/components/menu/category-form';
import type { CategoryListItemApi } from '@/lib/queries/catalog';

const INDENT_WIDTH_PX = 32;
const HOLD_TO_NEST_MS = 600;

export interface CategoriesTableProps {
  readonly categories: readonly CategoryListItemApi[];
}

interface RenderRow {
  readonly category: CategoryListItemApi;
  readonly isChild: boolean;
}

interface CategoryMoveInput {
  id: string;
  parentId: string | null;
  sortOrder: number;
}

const compareSiblings = (a: CategoryListItemApi, b: CategoryListItemApi): number =>
  a.sortOrder - b.sortOrder || a.id.localeCompare(b.id);

interface SortableCategoryRowProps {
  readonly category: CategoryListItemApi;
  readonly isChild: boolean;
  readonly parentName: string;
  readonly onEdit: () => void;
  readonly onArchive: () => void;
  readonly isPendingNestTarget: boolean;
}

function SortableCategoryRow({
  category,
  isChild,
  parentName,
  onEdit,
  onArchive,
  isPendingNestTarget,
}: SortableCategoryRowProps): React.ReactElement {
  const { t } = useTranslation('translation', { keyPrefix: 'menu.categories' });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
  });
  const displayName = fromLocalizedText(category.name);
  return (
    <TableRow
      ref={setNodeRef}
      data-testid={`category-row-${category.id}`}
      className={cn(
        'transition-colors duration-200',
        isChild && 'border-b-0',
        isPendingNestTarget && 'bg-accent ring-2 ring-primary ring-inset',
      )}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        ...(isChild && {
          backgroundImage:
            'linear-gradient(to right, transparent 0, transparent 16px, var(--border) 16px, var(--border) 100%)',
          backgroundPosition: 'bottom',
          backgroundSize: '100% 1px',
          backgroundRepeat: 'no-repeat',
        }),
      }}
    >
      <TableCell
        className={cn(
          'cursor-grab',
          isChild &&
            'relative before:absolute before:inset-y-0 before:left-4 before:w-px before:bg-border',
        )}
        style={{ paddingLeft: isChild ? `${INDENT_WIDTH_PX}px` : undefined }}
        {...attributes}
        {...listeners}
      >
        <div className="flex items-center gap-2">
          <GripVertical className="size-4 text-muted-foreground shrink-0" />
          <span className={cn(isChild && 'text-sm text-muted-foreground')}>{displayName}</span>
        </div>
      </TableCell>
      <TableCell className="text-center">{parentName}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="min-h-11 min-w-11"
            aria-label={t('editAriaLabel', { name: displayName })}
            onClick={onEdit}
          >
            <Pencil className="size-4" />
          </Button>
          {category.status === 'archived' ? null : (
            <Button
              variant="ghost"
              size="icon"
              className="min-h-11 min-w-11"
              aria-label={t('archiveAriaLabel', { name: displayName })}
              onClick={onArchive}
            >
              <Archive className="size-4" />
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

const buildIndentedRows = (categories: readonly CategoryListItemApi[]): RenderRow[] => {
  const parents = categories.filter((c) => c.parentId === null).sort(compareSiblings);
  const childrenByParent = new Map<string, CategoryListItemApi[]>();
  for (const c of categories) {
    if (c.parentId !== null) {
      const list = childrenByParent.get(c.parentId) ?? [];
      list.push(c);
      childrenByParent.set(c.parentId, list);
    }
  }
  return parents.flatMap((parent) => [
    { category: parent, isChild: false },
    ...(childrenByParent.get(parent.id) ?? [])
      .sort(compareSiblings)
      .map((child) => ({ category: child, isChild: true })),
  ]);
};

const computeReorder = (
  visibleCats: readonly CategoryListItemApi[],
  currentRows: readonly RenderRow[],
  draggedId: string,
  overId: string,
  newParentId: string | null,
): {
  moves: CategoryMoveInput[];
  nextLocalUpdates: Map<string, { parentId: string | null; sortOrder: number }>;
} => {
  const fromIdx = currentRows.findIndex((r) => r.category.id === draggedId);
  const toIdx = currentRows.findIndex((r) => r.category.id === overId);
  const newRows = arrayMove(currentRows.slice(), fromIdx, toIdx);

  const groups = new Map<string | null, string[]>();
  for (const row of newRows) {
    const id = row.category.id;
    const effectiveParent = id === draggedId ? newParentId : row.category.parentId;
    const list = groups.get(effectiveParent) ?? [];
    list.push(id);
    groups.set(effectiveParent, list);
  }

  const nextLocalUpdates = new Map<string, { parentId: string | null; sortOrder: number }>();
  const moves: CategoryMoveInput[] = [];
  for (const [pid, ids] of groups.entries()) {
    ids.forEach((id, idx) => {
      const newSort = idx * 10;
      nextLocalUpdates.set(id, { parentId: pid, sortOrder: newSort });
      const current = visibleCats.find((c) => c.id === id);
      if (!current) return;
      if (current.parentId !== pid || current.sortOrder !== newSort) {
        moves.push({ id, parentId: pid, sortOrder: newSort });
      }
    });
  }
  return { moves, nextLocalUpdates };
};

const isNestEligible = (
  visibleCats: readonly CategoryListItemApi[],
  draggedId: string,
  targetId: string,
): boolean => {
  if (draggedId === targetId) return false;
  const dragged = visibleCats.find((c) => c.id === draggedId);
  const target = visibleCats.find((c) => c.id === targetId);
  if (!dragged || !target) return false;
  if (target.parentId !== null) return false;
  if (dragged.parentId === target.id) return false;
  const draggedHasChildren = visibleCats.some((c) => c.parentId === draggedId);
  if (draggedHasChildren) return false;
  return true;
};

export function CategoriesTable({ categories }: CategoriesTableProps): React.ReactElement {
  const { t } = useTranslation('translation', { keyPrefix: 'menu.categories' });
  const { t: tCommon } = useTranslation('translation', { keyPrefix: 'common' });
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = React.useState<CategoryListItemApi | null>(null);
  const [localCategories, setLocalCategories] = React.useState(categories);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [pendingNestParentId, setPendingNestParentId] = React.useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const holdTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentOverIdRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    setLocalCategories(categories);
  }, [categories]);

  const reorderMutation = useMutation({
    mutationFn: (moves: CategoryMoveInput[]) => reorderCategories(moves),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['catalog', 'categories'] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => archiveCategory(id),
    onSuccess: (res) => {
      if (res.ok) {
        void queryClient.invalidateQueries({ queryKey: ['catalog', 'categories'] });
      } else {
        showError(null, t('archiveFailed'));
      }
    },
  });

  const handleArchiveConfirm = (): void => {
    if (!archiveTarget) return;
    const id = archiveTarget.id;
    setArchiveTarget(null);
    archiveMutation.mutate(id);
  };

  const visible = React.useMemo(
    () => localCategories.filter((c) => c.status !== 'archived'),
    [localCategories],
  );
  const rows = React.useMemo(() => buildIndentedRows(visible), [visible]);
  const editing = editingId ? (categories.find((c) => c.id === editingId) ?? null) : null;

  const cancelHoldTimer = (): void => {
    if (holdTimerRef.current !== null) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const resetDragState = (): void => {
    cancelHoldTimer();
    setActiveId(null);
    setPendingNestParentId(null);
    currentOverIdRef.current = null;
  };

  const handleDragStart = (event: DragStartEvent): void => {
    setActiveId(String(event.active.id));
    setPendingNestParentId(null);
    currentOverIdRef.current = null;
  };

  const handleDragOver = (event: DragOverEvent): void => {
    const draggedId = String(event.active.id);
    const newOverId = event.over ? String(event.over.id) : null;
    if (newOverId === currentOverIdRef.current) return;
    currentOverIdRef.current = newOverId;
    cancelHoldTimer();
    setPendingNestParentId(null);
    if (!newOverId) return;
    if (!isNestEligible(visible, draggedId, newOverId)) return;
    holdTimerRef.current = setTimeout(() => {
      if (currentOverIdRef.current === newOverId) {
        setPendingNestParentId(newOverId);
      }
      holdTimerRef.current = null;
    }, HOLD_TO_NEST_MS);
  };

  const handleDragCancel = (_event: DragCancelEvent): void => {
    resetDragState();
  };

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    const nestTarget = pendingNestParentId;
    resetDragState();
    if (!over) return;
    const draggedId = String(active.id);
    const overIdRaw = String(over.id);
    const draggedCat = visible.find((c) => c.id === draggedId);
    if (!draggedCat) return;

    let newParentId: string | null;
    if (nestTarget !== null) {
      newParentId = nestTarget;
    } else {
      const fromIdx = rows.findIndex((r) => r.category.id === draggedId);
      const toIdx = rows.findIndex((r) => r.category.id === overIdRaw);
      const projectedRows = arrayMove(rows.slice(), fromIdx, toIdx);
      const projectedIdx = projectedRows.findIndex((r) => r.category.id === draggedId);
      const previousRow = projectedIdx > 0 ? (projectedRows[projectedIdx - 1] ?? null) : null;
      if (!previousRow) {
        newParentId = null;
      } else if (previousRow.isChild) {
        newParentId = previousRow.category.parentId;
      } else {
        newParentId = null;
      }
    }

    if (newParentId !== null && newParentId !== draggedCat.parentId) {
      const draggedHasChildren = visible.some((c) => c.parentId === draggedId);
      if (draggedHasChildren) {
        showError(null, t('nestWithChildrenError'));
        return;
      }
    }

    if (draggedId === overIdRaw && newParentId === draggedCat.parentId) return;

    const { moves, nextLocalUpdates } = computeReorder(
      visible,
      rows,
      draggedId,
      overIdRaw,
      newParentId,
    );
    if (moves.length === 0) return;

    const previousCategories = localCategories;
    setLocalCategories((prev) =>
      prev.map((c) => {
        const update = nextLocalUpdates.get(c.id);
        return update ? { ...c, parentId: update.parentId, sortOrder: update.sortOrder } : c;
      }),
    );

    reorderMutation.mutate(moves, {
      onError: () => {
        setLocalCategories(previousCategories);
        showError(null, t('reorderFailed'));
      },
    });
  };

  return (
    <>
      {rows.length === 0 ? (
        <EmptyState variant="empty" title={t('empty')} description={t('emptyDescription')} />
      ) : (
        <DndContext
          id="categories-dnd"
          sensors={sensors}
          collisionDetection={closestCenter}
          autoScroll={false}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragCancel={handleDragCancel}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={rows.map((r) => r.category.id)}
            strategy={verticalListSortingStrategy}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('tableNameHeader')}</TableHead>
                  <TableHead className="text-center">{t('tableParentHeader')}</TableHead>
                  <TableHead className="w-24 text-right">{t('tableActionsHeader')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ category, isChild }) => (
                  <SortableCategoryRow
                    key={category.id}
                    category={category}
                    isChild={isChild}
                    parentName={
                      category.parentId
                        ? fromLocalizedText(
                            categories.find((c) => c.id === category.parentId)?.name ?? {},
                          )
                        : '—'
                    }
                    onArchive={() => {
                      setArchiveTarget(category);
                    }}
                    onEdit={() => {
                      setEditingId(category.id);
                    }}
                    isPendingNestTarget={
                      pendingNestParentId !== null &&
                      category.id === pendingNestParentId &&
                      activeId !== category.id
                    }
                  />
                ))}
              </TableBody>
            </Table>
          </SortableContext>
        </DndContext>
      )}

      <Sheet
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditingId(null);
        }}
      >
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>{t('editSheetTitle')}</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-4">
            {editing ? (
              <CategoryForm
                mode="edit"
                category={editing}
                allCategories={categories}
                onClose={() => {
                  setEditingId(null);
                }}
              />
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
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
              {t('archiveDialogDescription', {
                name: fromLocalizedText(archiveTarget?.name ?? {}),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchiveConfirm}>
              {t('archiveAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
