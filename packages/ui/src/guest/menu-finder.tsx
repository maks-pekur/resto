'use client';

import { cn } from '../lib/utils';
import { useGuestUi } from './guest-ui-provider';

export interface MenuFinderProps {
  readonly diets: readonly string[];
  readonly activeDiets: readonly string[];
  readonly onToggleDiet: (diet: string) => void;
}

/** Cuts a long menu down by what the guest can eat, client-side — the menu is already here. */
export const MenuFinder = ({ diets, activeDiets, onToggleDiet }: MenuFinderProps) => {
  const { t } = useGuestUi();

  return (
    <div className="flex flex-col gap-2">
      {diets.length > 0 ? (
        <ul className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {diets.map((diet) => {
            const active = activeDiets.includes(diet);
            return (
              <li key={diet}>
                <button
                  type="button"
                  aria-pressed={active}
                  data-testid={`diet-${diet}`}
                  onClick={() => {
                    onToggleDiet(diet);
                  }}
                  className={cn(
                    'flex h-8 cursor-pointer items-center rounded-full px-3 text-sm font-semibold whitespace-nowrap transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t(`diet.${diet}`)}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
};
