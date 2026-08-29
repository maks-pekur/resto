'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { MenuCategoryDto } from '@resto/api-client/public';
import { cn } from '../lib/utils';
import { localized } from '../lib/localized';
import { useGuestUi } from './guest-ui-provider';

export const sectionElementId = (categoryId: string): string => `menu-section-${categoryId}`;

export interface CategoryRailProps {
  readonly categories: readonly MenuCategoryDto[];
  /** Pinned to the right of the rail, outside the scrolling pill strip. */
  readonly action?: ReactNode;
}

export const CategoryRail = ({ categories, action }: CategoryRailProps) => {
  const { locale, t } = useGuestUi();
  const [activeId, setActiveId] = useState<string>(categories[0]?.id ?? '');
  const railRef = useRef<HTMLDivElement>(null);

  const categoryIds = useMemo(() => categories.map((c) => c.id).join(','), [categories]);

  useEffect(() => {
    const ids = categoryIds.length > 0 ? categoryIds.split(',') : [];
    if (ids.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id.replace('menu-section-', ''));
          }
        }
      },
      { rootMargin: '-25% 0px -65% 0px', threshold: 0 },
    );

    for (const id of ids) {
      const section = document.getElementById(sectionElementId(id));
      if (section) observer.observe(section);
    }

    return () => {
      observer.disconnect();
    };
  }, [categoryIds]);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail || !activeId) return;
    const pill = rail.querySelector<HTMLElement>(`[data-category-id="${activeId}"]`);
    pill?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [activeId]);

  const goToCategory = useCallback((categoryId: string) => {
    document
      .getElementById(sectionElementId(categoryId))
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveId(categoryId);
  }, []);

  if (categories.length === 0 && action == null) return null;

  return (
    <nav
      aria-label={t('menu.categories')}
      className="bg-background sticky top-(--header-height) z-40 border-b"
    >
      <div className="mx-auto flex h-(--category-rail-height) max-w-7xl items-center gap-2 px-4 sm:px-6">
        <div
          ref={railRef}
          className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {categories.map((category) => {
            const isActive = activeId === category.id;
            return (
              <button
                key={category.id}
                type="button"
                data-category-id={category.id}
                aria-current={isActive ? 'true' : undefined}
                onClick={() => {
                  goToCategory(category.id);
                }}
                className={cn(
                  'focus-visible:ring-ring h-11 shrink-0 cursor-pointer rounded-full px-4 text-sm font-bold whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:outline-none sm:h-9',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {localized(category.name, locale)}
              </button>
            );
          })}
        </div>
        {action}
      </div>
    </nav>
  );
};
