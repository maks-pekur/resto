import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const NONE_VALUE = '__none__';

export interface CategorySelectOption {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
}

export interface CategorySelectProps {
  readonly categories: readonly CategorySelectOption[];
  readonly value: string | null;
  readonly onChange: (value: string | null) => void;
  readonly mode: 'parent-picker' | 'item-picker';
  readonly disabled?: boolean;
  readonly placeholder?: string;
}

export function CategorySelect({
  categories,
  value,
  onChange,
  mode,
  disabled,
  placeholder,
}: CategorySelectProps): React.ReactElement {
  const { t } = useTranslation('translation', { keyPrefix: 'menu.categories' });
  const handleValueChange = (v: string): void => {
    if (v === NONE_VALUE) {
      onChange(null);
      return;
    }
    onChange(v);
  };

  const fallbackPlaceholder =
    mode === 'parent-picker' ? t('parentPickerPlaceholder') : t('itemPickerPlaceholder');

  return (
    <Select
      value={value ?? (mode === 'parent-picker' ? NONE_VALUE : undefined)}
      onValueChange={handleValueChange}
      disabled={disabled}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder ?? fallbackPlaceholder} />
      </SelectTrigger>
      <SelectContent>
        {mode === 'parent-picker' ? (
          <SelectItem value={NONE_VALUE}>{t('noneParentLabel')}</SelectItem>
        ) : null}
        {categories.map((c) => {
          const isChild = c.parentId !== null;
          const disabledOption = mode === 'parent-picker' && isChild;
          if (disabledOption) {
            return (
              <SelectItem key={c.id} value={c.id} disabled aria-disabled="true" className="pl-8">
                <span className="text-muted-foreground">
                  {t('childCannotBeParent', { name: c.name })}
                </span>
              </SelectItem>
            );
          }
          return (
            <SelectItem key={c.id} value={c.id} className={isChild ? 'pl-8' : ''}>
              {c.name}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
