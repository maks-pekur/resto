'use client';

import { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import type { MenuItemDto } from '@resto/api-client/public';
import { cn } from '../lib/utils';
import { useGuestUi } from './guest-ui-provider';

export interface NutritionInfoProps {
  readonly item: MenuItemDto;
  readonly className?: string;
}

/** True when the dish has anything worth opening a panel for. */
export const hasNutrition = (item: MenuItemDto): boolean =>
  item.kcal !== null || item.proteins !== null || item.fats !== null || item.carbs !== null;

const amount = (value: string | number, locale: string): string =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(Number(value));

/**
 * The nutrition a guest asks for by tapping, not a table every dish has to carry. Written without
 * a popover library: the panel is one absolutely-positioned box, and the guest bundle is opened
 * over mobile data.
 */
export const NutritionInfo = ({ item, className }: NutritionInfoProps) => {
  const { t, locale } = useGuestUi();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | TouchEvent): void => {
      if (rootRef.current?.contains(event.target as Node) === false) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const rows: readonly { readonly label: string; readonly value: string }[] = [
    item.kcal === null
      ? null
      : { label: t('item.calories'), value: `${amount(item.kcal, locale)} ${t('item.kcal')}` },
    item.proteins === null
      ? null
      : { label: t('item.protein'), value: `${amount(item.proteins, locale)} ${t('item.gram')}` },
    item.fats === null
      ? null
      : { label: t('item.fat'), value: `${amount(item.fats, locale)} ${t('item.gram')}` },
    item.carbs === null
      ? null
      : { label: t('item.carbs'), value: `${amount(item.carbs, locale)} ${t('item.gram')}` },
  ].filter((row): row is { label: string; value: string } => row !== null);

  if (rows.length === 0) return null;

  return (
    <div ref={rootRef} className={cn('relative shrink-0', className)}>
      <button
        type="button"
        aria-label={t('item.nutritionOpen')}
        aria-expanded={open}
        onClick={() => {
          setOpen((previous) => !previous);
        }}
        className="ring-border bg-muted text-muted-foreground hover:text-foreground focus-visible:ring-ring grid size-7 cursor-pointer place-items-center rounded-full ring-1 transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        <Info className="size-4" />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={t('item.nutrition')}
          className="bg-popover text-popover-foreground absolute end-0 top-full z-50 mt-2 w-56 rounded-xl border p-3 shadow-lg"
        >
          <p className="text-muted-foreground mb-2 text-xs">{t('item.nutritionPer100g')}</p>
          <dl className="flex flex-col gap-1.5">
            {rows.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-3 text-sm">
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="font-semibold tabular-nums">{row.value}</dd>
              </div>
            ))}
          </dl>
          {item.nutritionEstimated ? (
            <p className="text-muted-foreground mt-2 text-xs">{t('item.nutritionEstimated')}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
