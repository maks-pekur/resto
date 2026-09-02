'use client';

import { useGuestUi } from './guest-ui-provider';

/**
 * One mark per label, from the fixed vocabulary. Emoji rather than an icon set because they carry
 * their own colour on any background and cost no bytes; the crossed-out pairs are what menus
 * everywhere already use for "free from".
 */
const DIET_EMOJI: Readonly<Record<string, string>> = {
  vegetarian: '🌿',
  vegan: '🌱',
  gluten_free: '🚫🌾',
  lactose_free: '🚫🥛',
  spicy: '🌶️',
  halal: '☪️',
};

export interface DietMarksProps {
  readonly diets: readonly string[];
  /** On a card the mark stands alone; in the detail it is read with its word. */
  readonly withText?: boolean;
  readonly className?: string;
}

export const DietMarks = ({ diets, withText = false, className }: DietMarksProps) => {
  const { t } = useGuestUi();
  const marks = diets.filter((diet) => DIET_EMOJI[diet] !== undefined);
  if (marks.length === 0) return null;

  return (
    <ul className={className}>
      {marks.map((diet) => (
        <li
          key={diet}
          className={
            withText
              ? 'bg-primary-tint text-primary flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold'
              : 'text-sm leading-none'
          }
        >
          <span aria-hidden>{DIET_EMOJI[diet]}</span>
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
