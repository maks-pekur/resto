'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
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
  const t = useTranslations('menu.categories');
  const tCommon = useTranslations('common');
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
    <form action={action} noValidate className="flex flex-col gap-6">
      {category ? <input type="hidden" name="id" value={category.id} /> : null}
      <input type="hidden" name="parentId" value={parentId ?? ''} />
      <input type="hidden" name="sortOrder" value={category?.sortOrder ?? 0} />

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="cat-name">{t('name')}</FieldLabel>
          <Input
            id="cat-name"
            name="name"
            required
            maxLength={255}
            defaultValue={category ? fromLocalizedText(category.name) : ''}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="cat-parent">{t('parent')}</FieldLabel>
          <CategorySelect
            categories={selectOptions}
            value={parentId}
            onChange={setParentId}
            mode="parent-picker"
          />
          <FieldDescription>{t('parentHint')}</FieldDescription>
        </Field>

        {state.error ? <FieldError>{state.error}</FieldError> : null}
      </FieldGroup>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          {tCommon('cancel')}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? tCommon('saving') : mode === 'create' ? tCommon('create') : tCommon('save')}
        </Button>
      </div>
    </form>
  );
}
