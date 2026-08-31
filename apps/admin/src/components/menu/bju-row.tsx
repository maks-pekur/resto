import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';

export type BjuField = 'proteins' | 'fats' | 'carbs' | 'kcal';

export interface BjuRowProps {
  readonly proteins: number | null;
  readonly fats: number | null;
  readonly carbs: number | null;
  readonly kcal: number | null;
  readonly onChange: (field: BjuField, value: number | null) => void;
}

const parseValue = (raw: string, isInt: boolean): number | null => {
  if (raw.trim() === '') return null;
  const n = isInt ? Number.parseInt(raw, 10) : Number.parseFloat(raw);
  return Number.isFinite(n) ? n : null;
};

export function BjuRow({ proteins, fats, carbs, kcal, onChange }: BjuRowProps): React.ReactElement {
  const { t } = useTranslation('translation', { keyPrefix: 'menu.editor' });
  const fields: readonly {
    readonly key: BjuField;
    readonly label: string;
    readonly step: string;
  }[] = [
    { key: 'proteins', label: t('nutritionProteinsShort'), step: '0.1' },
    { key: 'fats', label: t('nutritionFatsShort'), step: '0.1' },
    { key: 'carbs', label: t('nutritionCarbsShort'), step: '0.1' },
    { key: 'kcal', label: t('nutritionKcalShort'), step: '1' },
  ];
  const values: Record<BjuField, number | null> = { proteins, fats, carbs, kcal };
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-4 gap-2">
        {fields.map((f) => (
          <label key={f.key} className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">{f.label}</span>
            <Input
              type="number"
              step={f.step}
              inputMode={f.key === 'kcal' ? 'numeric' : 'decimal'}
              value={values[f.key] ?? ''}
              onChange={(e) => {
                onChange(f.key, parseValue(e.target.value, f.key === 'kcal'));
              }}
              aria-label={f.label}
            />
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t('nutritionPer100g')}</p>
    </div>
  );
}
