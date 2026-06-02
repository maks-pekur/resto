'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { fromLocalizedText } from '@/lib/menu/localized';
import { showError, showSuccess } from '@/lib/ui/toast-helpers';
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

const rowsEqual = (a: RowDraft, b: ItemSizeApi): boolean =>
  a.name === fromLocalizedText(b.name) &&
  a.price.toFixed(2) === Number.parseFloat(b.price).toFixed(2) &&
  a.isDefault === b.isDefault;

export function ItemSizesTabClient({
  itemId,
  sizes,
  onSizesChange,
}: ItemSizesTabClientProps): React.ReactElement {
  const t = useTranslations('menu.sizes');
  const tCommon = useTranslations('common');
  const [rows, setRows] = React.useState<RowDraft[]>(() => sizes.map(rowFromApi));
  const [pending, setPending] = React.useState(false);

  const isNewItem = itemId === 'new';

  React.useEffect(() => {
    setRows(sizes.map(rowFromApi));
  }, [sizes]);

  const isDirty = React.useMemo(() => {
    if (rows.length !== sizes.length) return true;
    return rows.some((row) => {
      const original = sizes.find((s) => s.id === row.sizeId);
      if (!original) return true;
      return !rowsEqual(row, original);
    });
  }, [rows, sizes]);

  const updateRow = (localKey: string, patch: Partial<RowDraft>): void => {
    setRows((prev) => prev.map((r) => (r.localKey === localKey ? { ...r, ...patch } : r)));
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

  const onRemoveRow = (localKey: string): void => {
    setRows((prev) => prev.filter((r) => r.localKey !== localKey));
  };

  const onSetDefault = (localKey: string): void => {
    setRows((prev) => prev.map((r) => ({ ...r, isDefault: r.localKey === localKey })));
  };

  const onSave = async (): Promise<void> => {
    if (pending || isNewItem) return;
    setPending(true);

    const localIds = new Set(rows.map((r) => r.sizeId).filter((id): id is string => id !== null));
    const removed = sizes.filter((s) => !localIds.has(s.id));

    const failures: string[] = [];

    for (const row of rows) {
      if (!row.name.trim()) continue;
      const original = row.sizeId ? sizes.find((s) => s.id === row.sizeId) : null;
      if (original && rowsEqual(row, original)) continue;
      const res = await upsertItemSizeAction(itemId, {
        ...(row.sizeId ? { sizeId: row.sizeId } : {}),
        name: row.name,
        price: row.price,
        isDefault: row.isDefault,
      });
      if (!res.ok) failures.push(row.name);
    }

    for (const size of removed) {
      const res = await upsertItemSizeAction(
        itemId,
        {
          sizeId: size.id,
          name: fromLocalizedText(size.name),
          price: Number.parseFloat(size.price),
          isDefault: size.isDefault,
        },
        true,
      );
      if (!res.ok) failures.push(fromLocalizedText(size.name));
    }

    setPending(false);
    if (failures.length > 0) {
      showError(t('partialFailDetail', { names: failures.join(', ') }), t('partialFail'));
      return;
    }
    showSuccess(t('savedToast'), { duration: 1500 });
    onSizesChange(
      rows.map((r) => ({
        id: r.sizeId ?? r.localKey,
        name: { ru: r.name },
        price: r.price.toFixed(2),
        isDefault: r.isDefault,
      })),
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{isNewItem ? t('saveFirstHint') : t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!isNewItem && rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('emptyHint')}</p>
        ) : null}
        {rows.length > 0 ? (
          <div className="flex flex-col gap-2">
            {rows.map((row) => (
              <div
                key={row.localKey}
                className="grid grid-cols-[1fr_120px_80px_40px] items-center gap-2"
              >
                <Input
                  placeholder={t('namePlaceholder')}
                  value={row.name}
                  onChange={(e) => {
                    updateRow(row.localKey, { name: e.target.value });
                  }}
                />
                <Input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  placeholder={t('pricePlaceholder')}
                  value={row.price}
                  onChange={(e) => {
                    const n = Number.parseFloat(e.target.value);
                    updateRow(row.localKey, { price: Number.isFinite(n) ? n : 0 });
                  }}
                />
                <label className="flex items-center justify-center gap-1 text-xs">
                  <input
                    type="radio"
                    name="size-default"
                    checked={row.isDefault}
                    aria-label={t('defaultRadioFull')}
                    onChange={() => {
                      onSetDefault(row.localKey);
                    }}
                  />
                  <span className="text-muted-foreground">{t('defaultRadioShort')}</span>
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t('removeAriaLabel')}
                  onClick={() => {
                    onRemoveRow(row.localKey);
                  }}
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              </div>
            ))}
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onAddRow} disabled={isNewItem}>
            {t('addRow')}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              void onSave();
            }}
            disabled={pending || isNewItem || !isDirty}
          >
            {pending ? tCommon('saving') : t('saveBtn')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
