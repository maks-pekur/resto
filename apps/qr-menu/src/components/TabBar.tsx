'use client';

import type { ComponentType } from 'react';
import { cn } from '@resto/ui';
import { useScrollShrink } from './use-scroll-shrink';

export interface GuestTab {
  readonly id: string;
  readonly label: string;
  readonly icon: ComponentType<{ className?: string }>;
  readonly badge?: number;
  readonly onSelect: () => void;
}

export interface TabBarProps {
  readonly tabs: readonly GuestTab[];
  readonly active: string;
  readonly ariaLabel: string;
}

/**
 * The guest's way around, floating clear of the page. It sits above the home indicator and the
 * browser's own bottom chrome — `env(safe-area-inset-bottom)` is the only measurement that knows
 * where those end — and gives half its height back while the guest is reading downwards.
 */
export const TabBar = ({ tabs, active, ariaLabel }: TabBarProps) => {
  const compact = useScrollShrink();

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <nav
        aria-label={ariaLabel}
        data-compact={compact ? '' : undefined}
        className={cn(
          'bg-background/85 ring-border pointer-events-auto flex w-full max-w-md items-stretch gap-1 rounded-full p-1.5 shadow-lg ring-1 backdrop-blur transition-all duration-300',
          compact && 'max-w-xs p-1',
        )}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              aria-current={isActive ? 'page' : undefined}
              aria-label={tab.label}
              data-testid={`guest-tab-${tab.id}`}
              onClick={tab.onSelect}
              className={cn(
                'relative flex flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-full transition-all',
                compact ? 'py-1.5' : 'py-2',
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <span className="relative">
                <Icon className={cn('transition-all', compact ? 'size-5' : 'size-5')} />
                {tab.badge !== undefined && tab.badge > 0 ? (
                  <span className="bg-primary text-primary-foreground absolute -end-2 -top-1.5 grid min-w-4 place-items-center rounded-full px-1 text-[10px] leading-4 font-bold">
                    {tab.badge}
                  </span>
                ) : null}
              </span>
              {/* The label goes, not the target: the button keeps its full tap area either way. */}
              <span
                className={cn(
                  'overflow-hidden text-[11px] leading-none font-medium transition-all',
                  compact ? 'h-0 opacity-0' : 'h-3 opacity-100',
                )}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
