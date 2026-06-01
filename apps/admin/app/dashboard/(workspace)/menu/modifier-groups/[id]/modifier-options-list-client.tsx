'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { fromLocalizedText } from '@/lib/menu/localized';
import { showError, showSuccess } from '@/lib/ui/toast-helpers';
import { upsertModifierOptionAction } from './upsert-modifier-option-action';

export interface ModifierOptionApi {
  readonly id: string;
  readonly name: Record<string, string>;
  readonly priceDelta: string;
  readonly defaultAmount: number;
  readonly freeAmount: number;
  readonly sortOrder: number;
}

export interface ModifierOptionsListClientProps {
  readonly groupId: string;
  readonly options: readonly ModifierOptionApi[];
  readonly onOptionsChange: (options: readonly ModifierOptionApi[]) => void;
}

interface RowDraft {
  readonly localKey: string;
  readonly optionId: string | null;
  name: string;
  priceDelta: number;
  defaultAmount: number;
  freeAmount: number;
}

const rowFromApi = (o: ModifierOptionApi): RowDraft => ({
  localKey: o.id,
  optionId: o.id,
  name: fromLocalizedText(o.name),
  priceDelta: Number.parseFloat(o.priceDelta),
  defaultAmount: o.defaultAmount,
  freeAmount: o.freeAmount,
});

const rowsEqual = (a: RowDraft, b: ModifierOptionApi): boolean =>
  a.name === fromLocalizedText(b.name) &&
  a.priceDelta.toFixed(2) === Number.parseFloat(b.priceDelta).toFixed(2) &&
  a.defaultAmount === b.defaultAmount &&
  a.freeAmount === b.freeAmount;

export function ModifierOptionsListClient({
  groupId,
  options,
  onOptionsChange,
}: ModifierOptionsListClientProps): React.ReactElement {
  const [rows, setRows] = React.useState<RowDraft[]>(() => options.map(rowFromApi));
  const [pending, setPending] = React.useState(false);
  const isNewGroup = groupId === 'new';

  React.useEffect(() => {
    setRows(options.map(rowFromApi));
  }, [options]);

  const isDirty = React.useMemo(() => {
    if (rows.length !== options.length) return true;
    return rows.some((row) => {
      const original = options.find((o) => o.id === row.optionId);
      if (!original) return true;
      return !rowsEqual(row, original);
    });
  }, [rows, options]);

  const updateRow = (localKey: string, patch: Partial<RowDraft>): void => {
    setRows((prev) => prev.map((r) => (r.localKey === localKey ? { ...r, ...patch } : r)));
  };

  const onAddRow = (): void => {
    const localKey = `draft-${Date.now().toString()}`;
    setRows((prev) => [
      ...prev,
      {
        localKey,
        optionId: null,
        name: '',
        priceDelta: 0,
        defaultAmount: 0,
        freeAmount: 0,
      },
    ]);
  };

  const onSave = async (): Promise<void> => {
    if (pending || isNewGroup) return;
    setPending(true);

    const failures: string[] = [];
    for (const row of rows) {
      if (!row.name.trim()) continue;
      const original = row.optionId ? options.find((o) => o.id === row.optionId) : null;
      if (original && rowsEqual(row, original)) continue;
      const res = await upsertModifierOptionAction({
        groupId,
        ...(row.optionId ? { optionId: row.optionId } : {}),
        values: {
          name: row.name,
          priceDelta: row.priceDelta,
          defaultAmount: row.defaultAmount,
          freeAmount: row.freeAmount,
        },
      });
      if (!res.ok) failures.push(row.name);
    }

    setPending(false);
    if (failures.length > 0) {
      showError(`Не удалось сохранить: ${failures.join(', ')}`, 'Часть вариантов не сохранилась.');
      return;
    }
    showSuccess('Варианты сохранены', { duration: 1500 });
    onOptionsChange(
      rows.map((r, idx) => ({
        id: r.optionId ?? r.localKey,
        name: { ru: r.name },
        priceDelta: r.priceDelta.toFixed(2),
        defaultAmount: r.defaultAmount,
        freeAmount: r.freeAmount,
        sortOrder: idx,
      })),
    );
  };

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Нет вариантов — добавьте первый, чтобы группа что-то предлагала.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-[1fr_100px_80px_80px] gap-2 px-1 text-xs text-muted-foreground">
              <span>Название</span>
              <span>Наценка</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help">По ум.</span>
                </TooltipTrigger>
                <TooltipContent>Сколько штук добавляется по умолчанию.</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help">Бесп.</span>
                </TooltipTrigger>
                <TooltipContent>Сколько штук включено в базовую цену блюда.</TooltipContent>
              </Tooltip>
            </div>
            {rows.map((row) => (
              <div
                key={row.localKey}
                className="grid grid-cols-[1fr_100px_80px_80px] items-center gap-2"
              >
                <Input
                  placeholder="Название"
                  value={row.name}
                  onChange={(e) => {
                    updateRow(row.localKey, { name: e.target.value });
                  }}
                />
                <Input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="0"
                  value={row.priceDelta}
                  onChange={(e) => {
                    const n = Number.parseFloat(e.target.value);
                    updateRow(row.localKey, { priceDelta: Number.isFinite(n) ? n : 0 });
                  }}
                />
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={row.defaultAmount}
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value, 10);
                    updateRow(row.localKey, { defaultAmount: Number.isFinite(n) ? n : 0 });
                  }}
                />
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={row.freeAmount}
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value, 10);
                    updateRow(row.localKey, { freeAmount: Number.isFinite(n) ? n : 0 });
                  }}
                />
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAddRow}
            disabled={isNewGroup}
            title={isNewGroup ? 'Сначала сохраните название группы' : undefined}
          >
            + Добавить вариант
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              void onSave();
            }}
            disabled={pending || isNewGroup || !isDirty}
          >
            {pending ? 'Сохраняем…' : 'Сохранить варианты'}
          </Button>
        </div>
        {isNewGroup ? (
          <p className="text-xs text-muted-foreground">
            Сначала сохраните название группы — оно сохранится автоматически.
          </p>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
