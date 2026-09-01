import * as React from 'react';
import { type LocalizedText } from '@/lib/menu/localized';
import { useContentLocales } from '@/hooks/use-content-locales';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LocaleDisc } from '@/components/common/locale-disc';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { showError, showSuccess } from '@/lib/ui/toast-helpers';
import { upsertModifierOption } from '@/lib/queries/catalog';
import type { ModifierOptionApi } from '@/lib/queries/catalog';

export type { ModifierOptionApi };

export interface ModifierOptionsListProps {
  readonly groupId: string;
  readonly options: readonly ModifierOptionApi[];
  readonly onOptionsChange: (options: readonly ModifierOptionApi[]) => void;
}

interface RowDraft {
  readonly localKey: string;
  readonly optionId: string | null;
  /** Every language at once: the tab strip above the table decides which one is on screen. */
  name: LocalizedText;
  priceDelta: number;
  defaultAmount: number;
  freeAmount: number;
}

// Same read-side conversion the sizes card needs: the api sends localized text and a
// decimal string, the row draft holds what the inputs bind to.
const rowFromApi = (o: ModifierOptionApi): RowDraft => ({
  localKey: o.id,
  optionId: o.id,
  name: { ...o.name },
  priceDelta: Number.parseFloat(o.priceDelta),
  defaultAmount: o.defaultAmount,
  freeAmount: o.freeAmount,
});

const sameText = (a: LocalizedText, b: LocalizedText): boolean =>
  JSON.stringify(
    Object.entries(a)
      .filter(([, v]) => v.length > 0)
      .sort(),
  ) ===
  JSON.stringify(
    Object.entries(b)
      .filter(([, v]) => v.length > 0)
      .sort(),
  );

const rowsEqual = (a: RowDraft, b: ModifierOptionApi): boolean =>
  sameText(a.name, b.name) &&
  a.priceDelta.toFixed(2) === Number.parseFloat(b.priceDelta).toFixed(2) &&
  a.defaultAmount === b.defaultAmount &&
  a.freeAmount === b.freeAmount;

export function ModifierOptionsList({
  groupId,
  options,
  onOptionsChange,
}: ModifierOptionsListProps): React.ReactElement {
  const { t } = useTranslation('translation', { keyPrefix: 'menu.modifierGroups' });
  const { defaultLocale, locales } = useContentLocales();
  const [locale, setLocale] = React.useState(defaultLocale);
  const { t: tCommon } = useTranslation('translation', { keyPrefix: 'common' });
  const queryClient = useQueryClient();
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

  const upsertMutation = useMutation({
    mutationFn: (data: {
      id?: string;
      name: LocalizedText;
      priceDelta: number;
      defaultAmount: number;
      freeAmount: number;
    }) =>
      upsertModifierOption(groupId, {
        ...(data.id ? { id: data.id } : {}),
        name: data.name,
        priceDelta: data.priceDelta,
        defaultAmount: data.defaultAmount,
        freeAmount: data.freeAmount,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['catalog', 'modifier-group', groupId],
      });
    },
  });

  const updateRow = (localKey: string, patch: Partial<RowDraft>): void => {
    setRows((prev) => prev.map((r) => (r.localKey === localKey ? { ...r, ...patch } : r)));
  };

  const onAddRow = (): void => {
    const localKey = `draft-${Date.now().toString()}`;
    setRows((prev) => [
      ...prev,
      { localKey, optionId: null, name: {}, priceDelta: 0, defaultAmount: 0, freeAmount: 0 },
    ]);
  };

  const onSave = async (): Promise<void> => {
    if (pending || isNewGroup) return;
    setPending(true);
    const failures: string[] = [];
    for (const row of rows) {
      if ((row.name[defaultLocale] ?? '').trim().length === 0) continue;
      const original = row.optionId ? options.find((o) => o.id === row.optionId) : null;
      if (original && rowsEqual(row, original)) continue;
      try {
        await upsertMutation.mutateAsync({
          ...(row.optionId ? { id: row.optionId } : {}),
          name: row.name,
          priceDelta: row.priceDelta,
          defaultAmount: row.defaultAmount,
          freeAmount: row.freeAmount,
        });
      } catch {
        failures.push(row.name[defaultLocale] ?? '');
      }
    }
    setPending(false);
    if (failures.length > 0) {
      showError(
        t('partialFailOptionsDetail', { names: failures.join(', ') }),
        t('partialFailOptions'),
      );
      return;
    }
    showSuccess(t('savedOptions'), { duration: 1500 });
    onOptionsChange(
      rows.map((r, idx) => ({
        id: r.optionId ?? r.localKey,
        name: r.name,
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
        {locales.length > 1 && rows.length > 0 ? (
          <Tabs
            value={locale}
            onValueChange={(next) => {
              setLocale(next);
            }}
          >
            <TabsList aria-label={t('tableName')}>
              {locales.map((code) => (
                <TabsTrigger
                  key={code}
                  value={code}
                  data-testid={`option-locale-${code}`}
                  className="gap-1.5"
                >
                  <LocaleDisc locale={code} withCode={false} className="[&>span]:size-4" />
                  <span className="uppercase">{code}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        ) : null}
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('variantsEmpty')}</p>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-[1fr_100px_80px_80px] gap-2 px-1 text-xs text-muted-foreground">
              <span>{t('tableName')}</span>
              <span>{t('headerPriceDelta')}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help">{t('headerDefault')}</span>
                </TooltipTrigger>
                <TooltipContent>{t('tooltipDefault')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help">{t('headerFree')}</span>
                </TooltipTrigger>
                <TooltipContent>{t('tooltipFree')}</TooltipContent>
              </Tooltip>
            </div>
            {rows.map((row) => (
              <div
                key={row.localKey}
                className="grid grid-cols-[1fr_100px_80px_80px] items-center gap-2"
              >
                <Input
                  placeholder={t('namePlaceholder')}
                  value={row.name[locale] ?? ''}
                  onChange={(e) => {
                    const text = e.target.value;
                    const next: LocalizedText = Object.fromEntries(
                      Object.entries(row.name).filter(([code]) => code !== locale),
                    );
                    if (text.length > 0) next[locale] = text;
                    updateRow(row.localKey, { name: next });
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
            title={isNewGroup ? t('saveNameFirst') : undefined}
          >
            {t('addOption')}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              void onSave();
            }}
            disabled={pending || isNewGroup || !isDirty}
          >
            {pending ? tCommon('saving') : t('saveOptions')}
          </Button>
        </div>
        {isNewGroup ? <p className="text-xs text-muted-foreground">{t('newGroupHint')}</p> : null}
      </div>
    </TooltipProvider>
  );
}
