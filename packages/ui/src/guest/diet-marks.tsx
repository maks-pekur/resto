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
  /** On a card the mark stands alone; in the detail it is read with its word. */
  readonly withText?: boolean;
  readonly className?: string;
}

export const DietMarks = ({ diets, withText = false, className }: DietMarksProps) => {
  const { t } = useGuestUi();
  const marks = visibleDiets(diets).filter((diet) => DIET_EMOJI[diet] !== undefined);
  if (marks.length === 0) return null;

  return (
    <ul className={className}>
      {marks.map((diet) => (
        <li
          key={diet}
          className={
            withText
              ? 'bg-primary-tint text-primary flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold'
              : // The header's glass, over a photo: frosted where the browser can, plainly
                // opaque where it cannot.
                'bg-background/95 supports-[backdrop-filter]:bg-background/70 grid size-6 place-items-center rounded-full text-[0.8125rem] leading-none shadow-sm backdrop-blur'
          }
        >
          <span aria-hidden className="relative inline-flex leading-none">
            {DIET_EMOJI[diet]}
            {STRUCK_THROUGH.has(diet) ? (
              <span className="bg-destructive absolute inset-x-[-1px] top-1/2 h-[1.5px] -translate-y-1/2 -rotate-45 rounded-full" />
            ) : null}
          </span>
          {withText ? (
            <span>{t(`diet.${diet}`)}</span>
          ) : (
            <span className="sr-only">{t(`diet.${diet}`)}</span>
          )}
        </li>
      ))}
    </ul>
  );
};
