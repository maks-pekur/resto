'use client';

import * as React from 'react';
import { GripVertical, Pencil } from 'lucide-react';
import {
  DndContext,
  type DragEndEvent,
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
import { reorderCategoryAction } from './reorder-category-action';
import { CategoryFormClient } from './category-form-client';
import type { CategoryListItemApi } from './page';

export interface CategoriesTableClientProps {
  readonly categories: readonly CategoryListItemApi[];
}

interface RenderRow {
  readonly category: CategoryListItemApi;
  readonly isChild: boolean;
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
}

interface SortableCategoryRowProps {
  readonly category: CategoryListItemApi;
  readonly isChild: boolean;
  readonly parentName: string;
  readonly onEdit: () => void;
}

function SortableCategoryRow({
  category,
  isChild,
  parentName,
  onEdit,
}: SortableCategoryRowProps): React.ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
  });
  const displayName = fromLocalizedText(category.name);
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
      <TableCell className={isChild ? 'pl-8' : ''}>
        {isChild ? `↳ ${displayName}` : displayName}
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
  const parents = categories
    .filter((c) => c.parentId === null)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const childrenByParent = new Map<string, CategoryListItemApi[]>();
  for (const c of categories) {
    if (c.parentId !== null) {
      const list = childrenByParent.get(c.parentId) ?? [];
      list.push(c);
      childrenByParent.set(c.parentId, list);
    }
  }
  for (const list of childrenByParent.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  }

  const rows: RenderRow[] = [];
  parents.forEach((parent, parentIdx) => {
    rows.push({
      category: parent,
      isChild: false,
      canMoveUp: parentIdx > 0,
      canMoveDown: parentIdx < parents.length - 1,
    });
    const children = childrenByParent.get(parent.id) ?? [];
    children.forEach((child, childIdx) => {
      rows.push({
        category: child,
        isChild: true,
        canMoveUp: childIdx > 0,
        canMoveDown: childIdx < children.length - 1,
      });
    });
  });
  return rows;
};

export function CategoriesTableClient({
  categories,
}: CategoriesTableClientProps): React.ReactElement {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [localCategories, setLocalCategories] = React.useState(categories);
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

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const draggedId = String(active.id);
    const targetId = String(over.id);
    const dragged = localCategories.find((c) => c.id === draggedId);
    const target = localCategories.find((c) => c.id === targetId);
    if (!dragged || dragged.parentId !== target?.parentId) return;

    const siblings = localCategories
      .filter((c) => c.parentId === dragged.parentId && c.status !== 'archived')
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
    const fromIdx = siblings.findIndex((c) => c.id === dragged.id);
    const toIdx = siblings.findIndex((c) => c.id === target.id);
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;

    const reordered = arrayMove(siblings, fromIdx, toIdx);
    const newSortOrders = new Map(reordered.map((c, i) => [c.id, i * 10]));
    setLocalCategories((prev) =>
      prev.map((c) => {
        const newSort = newSortOrders.get(c.id);
        return newSort !== undefined ? { ...c, sortOrder: newSort } : c;
      }),
    );

    const direction = fromIdx < toIdx ? 'down' : 'up';
    const steps = Math.abs(toIdx - fromIdx);
    startTransition(async () => {
      for (let i = 0; i < steps; i += 1) {
        await reorderCategoryAction({ error: null, success: false }, { id: dragged.id, direction });
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
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
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
                    onEdit={() => {
                      setEditingId(category.id);
                    }}
                  />
                ))}
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
