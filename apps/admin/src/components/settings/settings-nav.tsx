import type { ComponentType } from 'react';
import { Link } from '@tanstack/react-router';
import { cn } from '@/lib/utils';

export interface SettingsNavItem {
  readonly value: string;
  readonly label: string;
  readonly icon: ComponentType<{ className?: string }>;
}

export interface SettingsNavProps {
  readonly items: readonly SettingsNavItem[];
  readonly active: string;
  readonly ariaLabel: string;
}

/** Rendered as links, not buttons: a settings section is an address an operator can bookmark. */
export function SettingsNav({ items, active, ariaLabel }: SettingsNavProps) {
  return (
    <nav
      aria-label={ariaLabel}
      className="flex gap-1 overflow-x-auto md:w-56 md:shrink-0 md:flex-col md:overflow-visible"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = item.value === active;
        return (
          <Link
            key={item.value}
            to="/settings"
            search={{ setting: item.value }}
            aria-current={isActive ? 'page' : undefined}
            data-testid={`settings-nav-${item.value}`}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
            )}
          >
            <Icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
