'use client';

import * as React from 'react';
import { GripVertical, Pencil, Trash2 } from 'lucide-react';
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { fromLocalizedText } from '@/lib/menu/localized';
import { archiveCategoryAction } from './archive-category-action';
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
  const [archiveTarget, setArchiveTarget] = React.useState<CategoryListItemApi | null>(null);
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [dragOverId, setDragOverId] = React.useState<string | null>(null);
  const [, startTransition] = React.useTransition();

  const visible = React.useMemo(
    () => categories.filter((c) => c.status !== 'archived'),
    [categories],
  );
  const rows = React.useMemo(() => buildIndentedRows(visible), [visible]);
  const editing = editingId ? (categories.find((c) => c.id === editingId) ?? null) : null;

  const handleDrop = (targetId: string): void => {
    if (!draggingId || draggingId === targetId) {
      setDraggingId(null);
      setDragOverId(null);
      return;
    }
    const dragged = categories.find((c) => c.id === draggingId);
    const target = categories.find((c) => c.id === targetId);
    setDraggingId(null);
    setDragOverId(null);
    if (!dragged || dragged.parentId !== target?.parentId) return;
    const siblings = rows.map((r) => r.category).filter((c) => c.parentId === dragged.parentId);
    const fromIdx = siblings.findIndex((c) => c.id === dragged.id);
    const toIdx = siblings.findIndex((c) => c.id === target.id);
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
    const direction = fromIdx < toIdx ? 'down' : 'up';
    const steps = Math.abs(toIdx - fromIdx);
    startTransition(async () => {
      for (let i = 0; i < steps; i += 1) {
        await reorderCategoryAction({ error: null, success: false }, { id: dragged.id, direction });
      }
    });
  };

  const handleConfirmArchive = (): void => {
    if (!archiveTarget) return;
    const id = archiveTarget.id;
    setArchiveTarget(null);
    startTransition(() => {
      void archiveCategoryAction({ error: null, success: false }, { id });
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
              const displayName = fromLocalizedText(category.name);
              const parent = category.parentId
                ? categories.find((c) => c.id === category.parentId)
                : null;
              const parentName = parent ? fromLocalizedText(parent.name) : '—';
              const isDragging = draggingId === category.id;
              const isDragOver = dragOverId === category.id && draggingId !== category.id;
              return (
                <TableRow
                  key={category.id}
                  data-testid={`category-row-${category.id}`}
                  draggable
                  onDragStart={(e) => {
                    setDraggingId(category.id);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', category.id);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (draggingId && draggingId !== category.id) {
                      const dragged = categories.find((c) => c.id === draggingId);
                      if (dragged?.parentId === category.parentId) {
                        setDragOverId(category.id);
                      }
                    }
                  }}
                  onDragLeave={() => {
                    if (dragOverId === category.id) setDragOverId(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDrop(category.id);
                  }}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setDragOverId(null);
                  }}
                  className={
                    isDragging
                      ? 'opacity-50'
                      : isDragOver
                        ? 'bg-accent/40 border-primary border-t-2'
                        : undefined
                  }
                >
                  <TableCell className="cursor-grab text-muted-foreground">
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
                        onClick={() => {
                          setEditingId(category.id);
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Архивировать ${displayName}`}
                        onClick={() => {
                          setArchiveTarget(category);
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
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

      <AlertDialog
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Архивировать категорию?</AlertDialogTitle>
            <AlertDialogDescription>
              {archiveTarget
                ? `Категория «${fromLocalizedText(archiveTarget.name)}» будет скрыта. Все блюда в ней останутся в черновике. Действие можно отменить, опубликовав категорию снова.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleConfirmArchive}>
              Архивировать
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
