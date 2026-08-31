'use client';

import { Moon, Sun } from 'lucide-react';
import { cn } from '../lib/utils';

export interface ThemeToggleProps {
  readonly resolvedTheme: 'light' | 'dark';
  readonly onToggle: () => void;
  readonly label: string;
  readonly className?: string;
}

// The icon follows the `resolvedTheme` prop rather than a `dark:` variant: the
// admin swaps themes with a class and the guest surfaces with `data-theme`, and
// one button has to render correctly under both.
export const ThemeToggle = ({ resolvedTheme, onToggle, label, className }: ThemeToggleProps) => {
  const isDark = resolvedTheme === 'dark';

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onToggle}
      className={cn(
        'focus-visible:ring-ring flex min-h-11 cursor-pointer items-center justify-center rounded-full transition focus-visible:ring-2 focus-visible:outline-none sm:min-h-8',
        className,
      )}
    >
      {/* The same disc the language control wears: two round controls, one shape. */}
      <span className="ring-border bg-muted text-muted-foreground relative grid size-7 shrink-0 place-items-center rounded-full ring-1">
        <Sun
          className={cn(
            'absolute size-4 transition-all duration-200',
            isDark ? 'scale-0 -rotate-90' : 'scale-100 rotate-0',
          )}
        />
        <Moon
          className={cn(
            'absolute size-4 transition-all duration-200',
            isDark ? 'scale-100 rotate-0' : 'scale-0 rotate-90',
          )}
        />
      </span>
    </button>
  );
};
