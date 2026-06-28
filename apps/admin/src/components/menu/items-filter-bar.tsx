import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CategorySelect } from '@/components/menu/category-select';
import type { ItemListStatusFilter } from '@/lib/menu/zod-schemas';

const DEBOUNCE_MS = 300;
const ALL_CATEGORIES_VALUE = '__all__';

export interface ItemsFilterBarCategory {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
}

export interface ItemsFilterBarProps {
  readonly categories: readonly ItemsFilterBarCategory[];
  readonly status: ItemListStatusFilter;
  readonly categoryId: string | null;
  readonly q: string;
  readonly onStatusChange: (status: ItemListStatusFilter) => void;
  readonly onCategoryChange: (categoryId: string | null) => void;
  readonly onQChange: (q: string) => void;
}

export function ItemsFilterBar({
  categories,
  status,
  categoryId,
  q,
  onStatusChange,
  onCategoryChange,
  onQChange,
}: ItemsFilterBarProps): React.ReactElement {
  const { t } = useTranslation('translation', { keyPrefix: 'menu.items' });
  const [localQ, setLocalQ] = React.useState(q);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    setLocalQ(q);
  }, [q]);

  const handleQChange = (next: string): void => {
    setLocalQ(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onQChange(next);
    }, DEBOUNCE_MS);
  };

  const STATUS_LABEL: Record<ItemListStatusFilter, string> = {
    'all-except-archived': t('filtersAll'),
    draft: t('filtersDraft'),
    published: t('filtersPublished'),
    archived: t('filtersArchived'),
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        type="search"
        placeholder={t('searchPlaceholder')}
        value={localQ}
        onChange={(e) => {
          handleQChange(e.target.value);
        }}
        aria-label={t('searchAriaLabel')}
        className="w-64"
      />
      <div className="w-56">
        <CategorySelect
          mode="item-picker"
          categories={[
            { id: ALL_CATEGORIES_VALUE, name: t('allCategories'), parentId: null },
            ...categories,
          ]}
          value={categoryId ?? ALL_CATEGORIES_VALUE}
          onChange={(v) => {
            onCategoryChange(v === ALL_CATEGORIES_VALUE ? null : v);
          }}
          placeholder={t('allCategories')}
        />
      </div>
      <Select
        value={status}
        onValueChange={(v) => {
          onStatusChange(v as ItemListStatusFilter);
        }}
      >
        <SelectTrigger className="w-56">
          <SelectValue placeholder={STATUS_LABEL['all-except-archived']} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all-except-archived">{STATUS_LABEL['all-except-archived']}</SelectItem>
          <SelectItem value="draft">{STATUS_LABEL.draft}</SelectItem>
          <SelectItem value="published">{STATUS_LABEL.published}</SelectItem>
          <SelectItem value="archived">{STATUS_LABEL.archived}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
