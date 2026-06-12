'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocale } from 'next-intl';
import type { MenuCategoryDto } from '@resto/api-client/public';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { localized } from '@/lib/i18n/localized';

interface CategoryNavProps {
  readonly categories: readonly MenuCategoryDto[];
}

export function CategoryNav({ categories }: CategoryNavProps) {
  const locale = useLocale();
  const [activeCategoryId, setActiveCategoryId] = useState<string>(categories[0]?.id ?? '');
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (categories.length === 0) return;

    const observers: IntersectionObserver[] = [];

    for (const category of categories) {
      const section = document.getElementById(`section-${category.id}`);
      if (!section) continue;

      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              setActiveCategoryId(category.id);
            }
          }
        },
        { rootMargin: '-20% 0px -60% 0px', threshold: 0 },
      );

      observer.observe(section);
      observers.push(observer);
    }

    return () => {
      for (const observer of observers) {
        observer.disconnect();
      }
    };
  }, [categories]);

  const handlePillClick = useCallback((categoryId: string) => {
    const section = document.getElementById(`section-${categoryId}`);
    if (section) {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setActiveCategoryId(categoryId);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const next = categories[currentIndex + 1];
      if (next) handlePillClick(next.id);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prev = categories[currentIndex - 1];
      if (prev) handlePillClick(prev.id);
    }
  };

  if (categories.length === 0) return null;

  return (
    <nav
      ref={navRef}
      aria-label="Menu categories"
      className="sticky top-[112px] z-30 h-12 w-full border-b bg-[oklch(0.97_0_0)]"
    >
      <ScrollArea className="h-full">
        <div className="flex h-12 items-center gap-1 px-4 sm:px-6">
          {categories.map((category, index) => {
            const name = localized(category.name, locale);
            const isActive = activeCategoryId === category.id;
            return (
              <button
                key={category.id}
                type="button"
                role="tab"
                aria-current={isActive ? 'true' : undefined}
                onClick={() => {
                  handlePillClick(category.id);
                }}
                onKeyDown={(e) => {
                  handleKeyDown(e, index);
                }}
                className={[
                  'relative flex h-8 shrink-0 items-center rounded-full px-4 text-[14px] leading-[1.4] transition-colors focus-visible:ring-2 focus-visible:ring-[--ring] whitespace-nowrap',
                  isActive
                    ? 'font-medium text-[var(--primary,#16a34a)] after:absolute after:bottom-[-16px] after:left-0 after:h-0.5 after:w-full after:bg-[var(--primary,#16a34a)] after:content-[""]'
                    : 'text-[oklch(0.45_0_0)] hover:text-foreground',
                ].join(' ')}
              >
                {name}
              </button>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </nav>
  );
}
