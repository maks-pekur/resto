'use client';

import * as React from 'react';
import { GripVertical, Pencil } from 'lucide-react';
import {
  DndContext,
  type DragCancelEvent,
  type DragEndEvent,
  type DragMoveEvent,
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
import { EmptyState } from '@/components/empty-state';
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
import { showError } from '@/lib/ui/toast-helpers';
import { reorderCategoriesAction, type CategoryMoveInput } from './reorder-category-action';
import { CategoryFormClient } from './category-form-client';
import type { CategoryListItemApi } from './page';

const INDENT_WIDTH_PX = 32;

export interface CategoriesTableClientProps {
  readonly categories: readonly CategoryListItemApi[];
}

interface RenderRow {
  readonly category: CategoryListItemApi;
  readonly isChild: boolean;
}

const compareSiblings = (a: CategoryListItemApi, b: CategoryListItemApi): number =>
  a.sortOrder - b.sortOrder || a.id.localeCompare(b.id);

interface SortableCategoryRowProps {
  readonly category: CategoryListItemApi;
  readonly isChild: boolean;
  readonly parentName: string;
  readonly onEdit: () => void;
  readonly depthOverride?: 0 | 1;
}

function SortableCategoryRow({
  category,
  isChild,
  parentName,
  onEdit,
  depthOverride,
}: SortableCategoryRowProps): React.ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
  });
  const displayName = fromLocalizedText(category.name);
  const effectiveDepth = depthOverride ?? (isChild ? 1 : 0);
  return (
    <TableRow
      ref={setNodeRef}
      data-testid={`category-row-${category.id}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      <TableCell className="cursor-grab text-muted-foreground" {...attributes} {...listeners}>
        <GripVertical className="size-4" />
      </TableCell>
      <TableCell style={{ paddingLeft: effectiveDepth >= 1 ? `${INDENT_WIDTH_PX}px` : undefined }}>
        {displayName}
      </TableCell>
      <TableCell>{parentName}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Редактировать ${displayName}`}
            onClick={onEdit}
          >
            <Pencil className="size-4" />
          </Button>
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

interface DropProjection {
  readonly newParentId: string | null;
  readonly depth: 0 | 1;
  readonly valid: boolean;
}

const projectDrop = (
  rows: readonly RenderRow[],
  draggedId: string,
  overId: string,
  offsetLeft: number,
): DropProjection => {
  const fromIdx = rows.findIndex((r) => r.category.id === draggedId);
  const toIdx = rows.findIndex((r) => r.category.id === overId);
  const dragged = rows[fromIdx];
  if (fromIdx < 0 || toIdx < 0 || !dragged) {
    return { newParentId: null, depth: 0, valid: false };
  }
  const newRows = arrayMove(rows.slice(), fromIdx, toIdx);
  const newIdx = newRows.findIndex((r) => r.category.id === draggedId);
  const previousRow = newIdx > 0 ? (newRows[newIdx - 1] ?? null) : null;

  const currentDepth = dragged.isChild ? 1 : 0;
  const dragDepth = Math.round(offsetLeft / INDENT_WIDTH_PX);
  const projectedDepth = Math.max(0, Math.min(1, currentDepth + dragDepth));

  let newParentId: string | null = null;
  let depth: 0 | 1 = 0;
  if (previousRow && projectedDepth >= 1) {
    newParentId = previousRow.isChild ? previousRow.category.parentId : previousRow.category.id;
    depth = 1;
  }

  const draggedHasChildren = rows.some((r) => r.category.parentId === draggedId);
  const valid = newParentId === null || !draggedHasChildren;
  return { newParentId, depth, valid };
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

export function CategoriesTableClient({
  categories,
}: CategoriesTableClientProps): React.ReactElement {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [localCategories, setLocalCategories] = React.useState(categories);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [overId, setOverId] = React.useState<string | null>(null);
  const [offsetLeft, setOffsetLeft] = React.useState(0);
  const [, startTransition] = React.useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  React.useEffect(() => {
    setLocalCategories(categories);
  }, [categories]);

  const visible = React.useMemo(
    () => localCategories.filter((c) => c.status !== 'archived'),
    [localCategories],
  );
  const rows = React.useMemo(() => buildIndentedRows(visible), [visible]);
  const editing = editingId ? (categories.find((c) => c.id === editingId) ?? null) : null;

  const dragProjection: DropProjection | null = React.useMemo(() => {
    if (!activeId || !overId) return null;
    return projectDrop(rows, activeId, overId, offsetLeft);
  }, [activeId, overId, offsetLeft, rows]);

  const resetDragState = (): void => {
    setActiveId(null);
    setOverId(null);
    setOffsetLeft(0);
  };

  const handleDragStart = (event: DragStartEvent): void => {
    setActiveId(String(event.active.id));
    setOverId(String(event.active.id));
    setOffsetLeft(0);
  };

  const handleDragMove = (event: DragMoveEvent): void => {
    setOffsetLeft(event.delta.x);
    if (event.over) setOverId(String(event.over.id));
  };

  const handleDragCancel = (_event: DragCancelEvent): void => {
    resetDragState();
  };

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    const projection = dragProjection;
    resetDragState();

    if (!over) return;
    const draggedId = String(active.id);
    const overIdRaw = String(over.id);
    if (draggedId === overIdRaw && offsetLeft === 0) return;

    if (projection && !projection.valid) {
      showError(
        null,
        'Нельзя вложить категорию с подкатегориями — сначала переместите подкатегории.',
      );
      return;
    }

    const newParentId = projection ? projection.newParentId : null;
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

    startTransition(async () => {
      const res = await reorderCategoriesAction({ error: null, success: false }, { moves });
      if (!res.success) {
        setLocalCategories(previousCategories);
        showError(res.error);
      }
    });
  };

  return (
    <>
      <div className="flex items-center justify-end">
        <Button
          size="sm"
          onClick={() => {
            setCreateOpen(true);
          }}
        >
          + Добавить категорию
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          variant="empty"
          title="Категории не добавлены"
          description="Добавьте первую категорию, чтобы сгруппировать блюда в меню."
          action={
            <Button
              onClick={() => {
                setCreateOpen(true);
              }}
            >
              + Добавить категорию
            </Button>
          }
        />
      ) : (
        <DndContext
          id="categories-dnd"
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
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
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Название</TableHead>
                  <TableHead>Родитель</TableHead>
                  <TableHead className="w-24 text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ category, isChild }) => {
                  const isActive = category.id === activeId;
                  return (
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
                      onEdit={() => {
                        setEditingId(category.id);
                      }}
                      depthOverride={isActive && dragProjection ? dragProjection.depth : undefined}
                    />
                  );
                })}
              </TableBody>
            </Table>
          </SortableContext>
        </DndContext>
      )}

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Новая категория</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-4">
            <CategoryFormClient
              mode="create"
              allCategories={categories}
              onClose={() => {
                setCreateOpen(false);
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      <Sheet
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditingId(null);
        }}
      >
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Редактирование категории</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-4">
            {editing ? (
              <CategoryFormClient
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
    </>
  );
}
