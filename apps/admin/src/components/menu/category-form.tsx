import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { CategorySelect } from '@/components/menu/category-select';
import { showError } from '@/lib/ui/toast-helpers';
import { upsertCategory } from '@/lib/queries/catalog';
import { fromLocalizedText } from '@/lib/menu/localized';
import type { CategoryListItemApi } from '@/lib/queries/catalog';

export interface CategoryFormProps {
  readonly mode: 'create' | 'edit';
  readonly category?: CategoryListItemApi;
  readonly allCategories: readonly CategoryListItemApi[];
  readonly onClose: () => void;
}

export function CategoryForm({
  mode,
  category,
  allCategories,
  onClose,
}: CategoryFormProps): React.ReactElement {
  const { t } = useTranslation('translation', { keyPrefix: 'menu.categories' });
  const { t: tCommon } = useTranslation('translation', { keyPrefix: 'common' });
  const queryClient = useQueryClient();
  const [name, setName] = React.useState(category ? fromLocalizedText(category.name) : '');
  const [parentId, setParentId] = React.useState<string | null>(category?.parentId ?? null);
  const [error, setError] = React.useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      upsertCategory(category?.id ?? null, {
        name,
        parentId,
        sortOrder: category?.sortOrder ?? 0,
      }),
    onSuccess: (res) => {
      if (res.ok) {
        void queryClient.invalidateQueries({ queryKey: ['catalog', 'categories'] });
        onClose();
      } else {
        setError(tCommon('errorGeneric'));
        showError(null, t('saveFailed'));
      }
    },
    onError: () => {
      showError(null, t('saveFailed'));
    },
  });

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

  const handleSubmit = (e: React.SyntheticEvent): void => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError(t('nameRequired'));
      return;
    }
    mutation.mutate();
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="cat-name">{t('name')}</FieldLabel>
          <Input
            id="cat-name"
            required
            maxLength={255}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
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
        {error ? <FieldError>{error}</FieldError> : null}
      </FieldGroup>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          {tCommon('cancel')}
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending
            ? tCommon('saving')
            : mode === 'create'
              ? tCommon('create')
              : tCommon('save')}
        </Button>
      </div>
    </form>
  );
}
