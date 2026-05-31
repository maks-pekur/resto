'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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

/**
 * Plan 04b-06 Task 2 — Items list filter bar.
 *
 * URL is the source of truth: each change pushes a new querystring via
 * `router.push`. Search input is debounced 300ms (mirrors
 * brand-form-client.tsx slug-availability pattern); the Select widgets
 * push immediately. Every filter change resets `page=1` so the operator
 * is not stranded on an out-of-range offset after narrowing the result
 * set.
 */

const DEBOUNCE_MS = 300;
const ALL_CATEGORIES_VALUE = '__all__';

export interface ItemsFilterBarCategory {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
}

export interface ItemsFilterBarClientProps {
  readonly categories: readonly ItemsFilterBarCategory[];
  readonly currentFilters: {
    readonly status: ItemListStatusFilter;
    readonly categoryId: string | null;
    readonly q: string;
  };
}

const STATUS_LABEL: Record<ItemListStatusFilter, string> = {
  'all-except-archived': 'Все кроме архива',
  draft: 'Черновики',
  published: 'Опубликованные',
  paused: 'Стоп',
  archived: 'Архив',
};

const buildUrl = (next: {
  readonly status: ItemListStatusFilter;
  readonly categoryId: string | null;
  readonly q: string;
}): string => {
  const sp = new URLSearchParams();
  if (next.status !== 'all-except-archived') {
    sp.set('status', next.status);
  }
  if (next.categoryId !== null && next.categoryId.length > 0) {
    sp.set('category', next.categoryId);
  }
  if (next.q.length > 0) {
    sp.set('q', next.q);
  }
  sp.set('page', '1');
  return `/dashboard/menu/items?${sp.toString()}`;
};

export function ItemsFilterBarClient({
  categories,
  currentFilters,
}: ItemsFilterBarClientProps): React.ReactElement {
  const router = useRouter();
  // useSearchParams() is referenced to opt-in to dynamic rendering — the
  // RSC parent has already parsed the params, so we read directly from
  // `currentFilters`. Calling the hook keeps the segment marked dynamic
  // and avoids a stale-cache foot-gun on prefetched links.
  useSearchParams();

  const [localQ, setLocalQ] = React.useState(currentFilters.q);
  const requestId = React.useRef(0);
  // Keep latest filters in a ref so the debounce closure doesn't capture
  // a stale snapshot after the operator changes the Select widgets.
  const latestRef = React.useRef(currentFilters);
  React.useEffect(() => {
    latestRef.current = currentFilters;
  }, [currentFilters]);

  React.useEffect(() => {
    if (localQ === currentFilters.q) return;
    const id = ++requestId.current;
    const handle = setTimeout(() => {
      if (id !== requestId.current) return;
      router.push(
        buildUrl({
          status: latestRef.current.status,
          categoryId: latestRef.current.categoryId,
          q: localQ,
        }),
      );
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(handle);
    };
  }, [localQ, currentFilters.q, router]);

  const handleStatusChange = (next: string): void => {
    router.push(
      buildUrl({
        status: next as ItemListStatusFilter,
        categoryId: latestRef.current.categoryId,
        q: latestRef.current.q,
      }),
    );
  };

  const handleCategoryChange = (next: string | null): void => {
    router.push(
      buildUrl({
        status: latestRef.current.status,
        categoryId: next,
        q: latestRef.current.q,
      }),
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        type="search"
        placeholder="Поиск блюд…"
        value={localQ}
        onChange={(e) => {
          setLocalQ(e.target.value);
        }}
        aria-label="Поиск блюд"
        className="w-64"
      />
      <div className="w-56">
        <CategorySelect
          mode="item-picker"
          categories={[
            { id: ALL_CATEGORIES_VALUE, name: 'Все категории', parentId: null },
            ...categories,
          ]}
          value={currentFilters.categoryId ?? ALL_CATEGORIES_VALUE}
          onChange={(v) => {
            handleCategoryChange(v === ALL_CATEGORIES_VALUE ? null : v);
          }}
          placeholder="Все категории"
        />
      </div>
      <Select value={currentFilters.status} onValueChange={handleStatusChange}>
        <SelectTrigger className="w-56">
          <SelectValue placeholder={STATUS_LABEL['all-except-archived']} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all-except-archived">{STATUS_LABEL['all-except-archived']}</SelectItem>
          <SelectItem value="draft">{STATUS_LABEL.draft}</SelectItem>
          <SelectItem value="published">{STATUS_LABEL.published}</SelectItem>
          <SelectItem value="paused">{STATUS_LABEL.paused}</SelectItem>
          <SelectItem value="archived">{STATUS_LABEL.archived}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
