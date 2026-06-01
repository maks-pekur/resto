'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fromLocalizedText } from '@/lib/menu/localized';
import { upsertItemSizeAction } from './upsert-item-size-action';
import type { ItemSizeApi } from './types';

export interface ItemSizesTabClientProps {
  readonly itemId: string;
  readonly sizes: readonly ItemSizeApi[];
  readonly onSizesChange: (sizes: readonly ItemSizeApi[]) => void;
}

interface RowDraft {
  readonly localKey: string;
  readonly sizeId: string | null;
  name: string;
  price: number;
  isDefault: boolean;
}

const rowFromApi = (s: ItemSizeApi): RowDraft => ({
  localKey: s.id,
  sizeId: s.id,
  name: fromLocalizedText(s.name),
  price: Number.parseFloat(s.price),
  isDefault: s.isDefault,
});

const stubName = (s3Key: string): Record<string, string> => ({ ru: s3Key });

export function ItemSizesTabClient({
  itemId,
  sizes,
  onSizesChange,
}: ItemSizesTabClientProps): React.ReactElement {
  const [rows, setRows] = React.useState<RowDraft[]>(() => sizes.map(rowFromApi));

  React.useEffect(() => {
    setRows(sizes.map(rowFromApi));
  }, [sizes]);

  const isNewItem = itemId === 'new';

  const updateRow = (localKey: string, patch: Partial<RowDraft>): void => {
    setRows((prev) => prev.map((r) => (r.localKey === localKey ? { ...r, ...patch } : r)));
  };

  const persistRow = async (row: RowDraft): Promise<void> => {
    if (isNewItem || !row.name.trim()) return;
    const payload: {
      sizeId?: string;
      name: string;
      price: number;
      isDefault: boolean;
    } = {
      name: row.name,
      price: row.price,
      isDefault: row.isDefault,
    };
    if (row.sizeId) payload.sizeId = row.sizeId;
    const res = await upsertItemSizeAction(itemId, payload);
    if (res.ok && res.id && !row.sizeId) {
      setRows((prev) =>
        prev.map((r) =>
          r.localKey === row.localKey
            ? { ...r, sizeId: res.id ?? null, localKey: res.id ?? r.localKey }
            : r,
        ),
      );
      onSizesChange([
        ...sizes,
        {
          id: res.id,
          name: stubName(row.name),
          price: row.price.toFixed(2),
          isDefault: row.isDefault,
        },
      ]);
    }
  };

  const onAddRow = (): void => {
    const localKey = `draft-${Date.now().toString()}`;
    setRows((prev) => [
      ...prev,
      {
        localKey,
        sizeId: null,
        name: '',
        price: 0,
        isDefault: prev.length === 0,
      },
    ]);
  };

  const onRemoveRow = async (row: RowDraft): Promise<void> => {
    if (!row.sizeId) {
      setRows((prev) => prev.filter((r) => r.localKey !== row.localKey));
      return;
    }
    const res = await upsertItemSizeAction(
      itemId,
      { sizeId: row.sizeId, name: row.name, price: row.price, isDefault: row.isDefault },
      true,
    );
    if (res.ok) {
      setRows((prev) => prev.filter((r) => r.localKey !== row.localKey));
      onSizesChange(sizes.filter((s) => s.id !== row.sizeId));
    }
  };

  const onToggleDefault = async (row: RowDraft): Promise<void> => {
    if (row.isDefault) return;
    const previousDefault = rows.find((r) => r.isDefault && r.localKey !== row.localKey) ?? null;
    setRows((prev) => prev.map((r) => ({ ...r, isDefault: r.localKey === row.localKey })));
    const updated: RowDraft = { ...row, isDefault: true };
    await persistRow(updated);
    if (previousDefault) {
      const cleared: RowDraft = { ...previousDefault, isDefault: false };
      await persistRow(cleared);
    }
  };

  if (rows.length === 0 && isNewItem) {
    return (
      <div className="rounded-lg border border-dashed border-input p-6 text-sm text-muted-foreground">
        Сначала введите название блюда — оно сохранится автоматически.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Нет размеров — блюдо использует базовую цену.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div
              key={row.localKey}
              className="grid grid-cols-[1fr_120px_80px_40px] items-center gap-2"
            >
              <Input
                placeholder="Название"
                value={row.name}
                onChange={(e) => {
                  updateRow(row.localKey, { name: e.target.value });
                }}
                onBlur={() => {
                  void persistRow({ ...row, name: row.name });
                }}
              />
              <Input
                type="number"
                step="0.01"
                inputMode="decimal"
                placeholder="Цена"
                value={row.price}
                onChange={(e) => {
                  const n = Number.parseFloat(e.target.value);
                  updateRow(row.localKey, { price: Number.isFinite(n) ? n : 0 });
                }}
                onBlur={() => {
                  void persistRow({ ...row });
                }}
              />
              <label className="flex items-center justify-center gap-1 text-xs">
                <input
                  type="radio"
                  name="size-default"
                  checked={row.isDefault}
                  aria-label="По умолчанию"
                  onChange={() => {
                    void onToggleDefault(row);
                  }}
                />
                <span className="text-muted-foreground">По&nbsp;умолч.</span>
              </label>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Удалить размер"
                onClick={() => {
                  void onRemoveRow(row);
                }}
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onAddRow}
        disabled={isNewItem}
        title={isNewItem ? 'Сначала сохраните блюдо' : undefined}
      >
        + Добавить размер
      </Button>
    </div>
  );
}
