'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { fromLocalizedText } from '@/lib/menu/localized';
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

export function ModifierOptionsListClient({
  groupId,
  options,
  onOptionsChange,
}: ModifierOptionsListClientProps): React.ReactElement {
  const [rows, setRows] = React.useState<RowDraft[]>(() => options.map(rowFromApi));
  const isNewGroup = groupId === 'new';

  React.useEffect(() => {
    setRows(options.map(rowFromApi));
  }, [options]);

  const updateRow = (localKey: string, patch: Partial<RowDraft>): void => {
    setRows((prev) => prev.map((r) => (r.localKey === localKey ? { ...r, ...patch } : r)));
  };

  const persistRow = async (row: RowDraft): Promise<void> => {
    if (isNewGroup || !row.name.trim()) return;
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
    if (res.ok && !row.optionId) {
      setRows((prev) =>
        prev.map((r) =>
          r.localKey === row.localKey ? { ...r, optionId: res.id, localKey: res.id } : r,
        ),
      );
      onOptionsChange([
        ...options,
        {
          id: res.id,
          name: { ru: row.name },
          priceDelta: row.priceDelta.toFixed(2),
          defaultAmount: row.defaultAmount,
          freeAmount: row.freeAmount,
          sortOrder: options.length,
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
        optionId: null,
        name: '',
        priceDelta: 0,
        defaultAmount: 0,
        freeAmount: 0,
      },
    ]);
  };

  return (
    <TooltipProvider>
      <div className="space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Нет вариантов — добавьте первый, чтобы группа что-то предлагала.
          </p>
        ) : (
          <div className="space-y-2">
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
                  onBlur={() => {
                    void persistRow({ ...row, name: row.name });
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
                  onBlur={() => {
                    void persistRow({ ...row });
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
                  onBlur={() => {
                    void persistRow({ ...row });
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
                  onBlur={() => {
                    void persistRow({ ...row });
                  }}
                />
              </div>
            ))}
          </div>
        )}
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
        {isNewGroup ? (
          <p className="text-xs text-muted-foreground">
            Сначала сохраните название группы — оно сохранится автоматически.
          </p>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
