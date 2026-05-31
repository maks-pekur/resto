'use client';

import * as React from 'react';
import { ChevronDown, ChevronUp, Pencil, Trash2 } from 'lucide-react';
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
import { StatusBadge } from '@/components/menu/status-badge';
import { fromLocalizedText } from '@/lib/menu/localized';
import type { Status } from '@/lib/menu/types';
import { archiveCategoryAction } from './archive-category-action';
import { reorderCategoryAction } from './reorder-category-action';
import { CategoryFormClient } from './category-form-client';
import type { CategoryListItemApi } from './page';

/**
 * Plan 04b-05 Task 3 — Categories table client island.
 *
 * Renders the parent → child indented flat list per UI-SPEC §Categories
 * page (D-4b-01 caps depth at 2). Archive uses an AlertDialog with the
 * exact UI-SPEC §Destructive actions row-1 copy. Reorder buttons hide at
 * row boundaries (top row has no ↑, bottom row has no ↓).
 *
 * The "Показать архив / Скрыть архив" toggle filters client-side because
 * the backend list endpoint returns all statuses (D-03 default = all
 * except archived).
 */

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
  const [showArchived, setShowArchived] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [archiveTarget, setArchiveTarget] = React.useState<CategoryListItemApi | null>(null);
  const [, startTransition] = React.useTransition();

  const visible = React.useMemo(
    () => (showArchived ? categories : categories.filter((c) => c.status !== 'archived')),
    [categories, showArchived],
  );
  const rows = React.useMemo(() => buildIndentedRows(visible), [visible]);
  const editing = editingId ? (categories.find((c) => c.id === editingId) ?? null) : null;

  const handleReorder = (id: string, direction: 'up' | 'down'): void => {
    startTransition(() => {
      void reorderCategoryAction({ error: null, success: false }, { id, direction });
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
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setShowArchived((v) => !v);
          }}
        >
          {showArchived ? 'Скрыть архив' : 'Показать архив'}
        </Button>
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
              <TableHead className="w-20">Порядок</TableHead>
              <TableHead>Название</TableHead>
              <TableHead>Родитель</TableHead>
              <TableHead className="w-24">Позиция</TableHead>
              <TableHead className="w-32">Статус</TableHead>
              <TableHead className="w-24 text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ category, isChild, canMoveUp, canMoveDown }) => {
              const displayName = fromLocalizedText(category.name);
              const parent = category.parentId
                ? categories.find((c) => c.id === category.parentId)
                : null;
              const parentName = parent ? fromLocalizedText(parent.name) : '—';
              const status = category.status as Status;
              return (
                <TableRow key={category.id} data-testid={`category-row-${category.id}`}>
                  <TableCell>
                    <div className="flex gap-1">
                      {canMoveUp ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Переместить выше"
                          onClick={() => {
                            handleReorder(category.id, 'up');
                          }}
                        >
                          <ChevronUp className="size-4" />
                        </Button>
                      ) : null}
                      {canMoveDown ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Переместить ниже"
                          onClick={() => {
                            handleReorder(category.id, 'down');
                          }}
                        >
                          <ChevronDown className="size-4" />
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className={isChild ? 'pl-8' : ''}>
                    {isChild ? `↳ ${displayName}` : displayName}
                  </TableCell>
                  <TableCell>{parentName}</TableCell>
                  <TableCell>{category.sortOrder}</TableCell>
                  <TableCell>
                    <StatusBadge status={status} />
                  </TableCell>
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
