'use client';

import { useGuestUi } from './guest-ui-provider';
import { visibleDiets } from './diet-rules';

/**
 * One mark per label, from the fixed vocabulary. Emoji rather than an icon set because they carry
 * their own colour on any background and cost no bytes; the crossed-out pairs are what menus
 * everywhere already use for "free from".
 */
const DIET_EMOJI: Readonly<Record<string, string>> = {
  // The convention printed menus already use: a sprout means plant-based, a salad means
  // meat-free but not dairy-free, and "free from" is the ingredient with a bar through it.
  vegetarian: '🥗',
  vegan: '🌱',
  gluten_free: '🌾',
  lactose_free: '🥛',
  spicy: '🌶️',
  halal: '☪️',
};

/** "Free from" is the ingredient with a line through it — two glyphs side by side read as litter. */
const STRUCK_THROUGH = new Set(['gluten_free', 'lactose_free']);

export interface DietMarksProps {
  readonly diets: readonly string[];
  readonly className?: string;
}

/** Read as part of the dish's name — "Маргарита 🥗" — rather than as a badge stuck on the photo. */
export const DietMarks = ({ diets, className }: DietMarksProps) => {
  const { t } = useGuestUi();
  const marks = visibleDiets(diets).filter((diet) => DIET_EMOJI[diet] !== undefined);
  if (marks.length === 0) return null;

  return (
    <span className={className}>
      {marks.map((diet) => (
        <span key={diet} className="ms-1 inline-flex align-baseline">
          <span aria-hidden className="relative inline-flex leading-none">
            {DIET_EMOJI[diet]}
            {STRUCK_THROUGH.has(diet) ? (
              <span className="bg-destructive absolute inset-x-[-1px] top-1/2 h-[1.5px] -translate-y-1/2 -rotate-45 rounded-full" />
            ) : null}
          </span>
          <span className="sr-only">{t(`diet.${diet}`)}</span>
        </span>
      ))}
    </span>
  );
};
