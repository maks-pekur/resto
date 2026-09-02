'use client';

import { useEffect, useRef } from 'react';
import { SearchIcon, XIcon } from '../icons';
import { cn } from '../lib/utils';
import { useGuestUi } from './guest-ui-provider';

export interface MenuFinderProps {
  /** The field is revealed by the magnifier in the header; the labels stay in sight. */
  readonly searchOpen: boolean;
  readonly query: string;
  readonly onQueryChange: (next: string) => void;
  readonly diets: readonly string[];
  readonly activeDiets: readonly string[];
  readonly onToggleDiet: (diet: string) => void;
}

/**
 * Two ways to cut a long menu down: by word and by what the guest can eat. Both are client-side —
 * the whole menu is already in the page, and a round trip per keystroke over mobile data is not.
 */
export const MenuFinder = ({
  searchOpen,
  query,
  onQueryChange,
  diets,
  activeDiets,
  onToggleDiet,
}: MenuFinderProps) => {
  const { t } = useGuestUi();
  const field = useRef<HTMLInputElement | null>(null);

  // The field is kept mounted so it can grow out of the icon rather than appear at full width;
  // focus therefore has to be asked for, `autoFocus` only fires on mount.
  useEffect(() => {
    if (searchOpen) field.current?.focus();
  }, [searchOpen]);

  return (
    <div className="flex flex-col gap-2">
      <div
        // Opens from the middle outwards to both edges, and folds back into itself.
        className={cn(
          'flex overflow-hidden transition-all duration-300 ease-out motion-reduce:transition-none',
          searchOpen ? 'h-10 opacity-100' : 'h-0 opacity-0',
        )}
        {...(searchOpen ? {} : { inert: true })}
      >
        <div
          className={cn(
            'relative mx-auto transition-[width] duration-300 ease-out motion-reduce:transition-none',
            searchOpen ? 'w-full' : 'w-10',
          )}
        >
          <SearchIcon
            aria-hidden
            className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
          />
          <input
            type="search"
            ref={field}
            value={query}
            tabIndex={searchOpen ? 0 : -1}
            aria-label={t('finder.searchLabel')}
            placeholder={t('finder.searchPlaceholder')}
            onChange={(event) => {
              onQueryChange(event.target.value);
            }}
            className="border-input focus-visible:border-primary h-10 w-full rounded-full border ps-9 pe-9 text-base transition-colors focus-visible:outline-none"
          />
          {query.length > 0 ? (
            <button
              type="button"
              aria-label={t('finder.clear')}
              onClick={() => {
                onQueryChange('');
              }}
              className="text-muted-foreground hover:text-foreground absolute end-0.5 top-1/2 grid size-9 -translate-y-1/2 cursor-pointer place-items-center rounded-full"
            >
              <XIcon className="size-4" />
            </button>
          ) : null}
        </div>
      </div>

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
