'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CategorySelect } from '@/components/menu/category-select';
import { fromLocalizedText } from '@/lib/menu/localized';
import { upsertCategoryAction, type UpsertCategoryActionState } from './upsert-category-action';
import type { CategoryListItemApi } from './page';

const INITIAL: UpsertCategoryActionState = { error: null, success: null };

export interface CategoryFormClientProps {
  readonly mode: 'create' | 'edit';
  readonly category?: CategoryListItemApi;
  readonly allCategories: readonly CategoryListItemApi[];
  readonly onClose: () => void;
}

export function CategoryFormClient({
  mode,
  category,
  allCategories,
  onClose,
}: CategoryFormClientProps): React.ReactElement {
  const [state, action, pending] = useActionState(upsertCategoryAction, INITIAL);
  const [parentId, setParentId] = React.useState<string | null>(category?.parentId ?? null);

  React.useEffect(() => {
    if (state.success) {
      onClose();
    }
  }, [state.success, onClose]);

  const selectOptions = React.useMemo(
    () =>
      allCategories
        .filter((c) => c.id !== category?.id)
        .map((c) => ({
          id: c.id,
          name: fromLocalizedText(c.name),
          parentId: c.parentId,
        })),
    [allCategories, category?.id],
  );

  return (
    <form action={action} className="space-y-4" noValidate>
      {category ? <input type="hidden" name="id" value={category.id} /> : null}
      <input type="hidden" name="parentId" value={parentId ?? ''} />

      <div className="space-y-2">
        <Label htmlFor="cat-name">Название</Label>
        <Input
          id="cat-name"
          name="name"
          required
          maxLength={255}
          defaultValue={category ? fromLocalizedText(category.name) : ''}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="cat-parent">Родительская категория</Label>
        <CategorySelect
          categories={selectOptions}
          value={parentId}
          onChange={setParentId}
          mode="parent-picker"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="cat-sort">Порядок сортировки</Label>
        <Input
          id="cat-sort"
          name="sortOrder"
          type="number"
          min={0}
          defaultValue={category?.sortOrder ?? 0}
        />
      </div>

      {state.error ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Отмена
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Сохраняем…' : mode === 'create' ? 'Создать' : 'Сохранить'}
        </Button>
      </div>
    </form>
  );
}
