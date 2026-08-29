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
        'text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring relative flex size-11 cursor-pointer items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none sm:size-9',
        className,
      )}
    >
      <Sun
        className={cn(
          'absolute size-5 transition-all duration-200',
          isDark ? 'scale-0 -rotate-90' : 'scale-100 rotate-0',
        )}
      />
      <Moon
        className={cn(
          'absolute size-5 transition-all duration-200',
          isDark ? 'scale-100 rotate-0' : 'scale-0 rotate-90',
        )}
      />
    </button>
  );
};
