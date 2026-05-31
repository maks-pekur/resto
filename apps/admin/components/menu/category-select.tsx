'use client';

import * as React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * Indented category dropdown (D-4b-01, RESEARCH.md Pattern 5).
 *
 * Two modes:
 *  - `parent-picker`: used in the category create/edit form. The first
 *    option is "— Без родителя —" (= top-level). Existing child categories
 *    (parentId !== null) are rendered disabled with a muted "(уже является
 *    подкатегорией)" label so the operator cannot pick them as a parent —
 *    enforcing depth ≤ 2 (D-4b-01). Zod refine in `zod-schemas.ts` is the
 *    server-side belt to this client-side suspender.
 *  - `item-picker`: used in the item editor (Plan 06) and items-list
 *    filter. All options selectable; children visually indented with `↳ `
 *    and `pl-8` so the operator sees the hierarchy at a glance.
 *
 * Russian copy per D-05 single-locale MVP-1.
 */

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
  const handleValueChange = (v: string): void => {
    if (v === NONE_VALUE) {
      onChange(null);
      return;
    }
    onChange(v);
  };

  const fallbackPlaceholder =
    mode === 'parent-picker' ? 'Выберите категорию' : 'Категория не выбрана';

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
          <SelectItem value={NONE_VALUE}>— Без родителя —</SelectItem>
        ) : null}
        {categories.map((c) => {
          const isChild = c.parentId !== null;
          const disabledOption = mode === 'parent-picker' && isChild;
          if (disabledOption) {
            return (
              <SelectItem key={c.id} value={c.id} disabled aria-disabled="true" className="pl-8">
                <span className="text-muted-foreground">
                  ↳ {c.name} (уже является подкатегорией)
                </span>
              </SelectItem>
            );
          }
          return (
            <SelectItem key={c.id} value={c.id} className={isChild ? 'pl-8' : ''}>
              {isChild ? `↳ ${c.name}` : c.name}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
