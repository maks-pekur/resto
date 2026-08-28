'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import type { ComponentType } from 'react';
import { cn } from '../lib/utils';
import { useGuestUi } from './guest-ui-provider';
import { GUEST_THEMES, type GuestTheme } from './use-guest-theme';
import type { GuestUiKey } from './messages';

const OPTIONS: Readonly<
  Record<
    GuestTheme,
    { readonly Icon: ComponentType<{ className?: string }>; readonly key: GuestUiKey }
  >
> = {
  system: { Icon: Monitor, key: 'theme.system' },
  light: { Icon: Sun, key: 'theme.light' },
  dark: { Icon: Moon, key: 'theme.dark' },
};

export interface ThemeSwitcherProps {
  readonly theme: GuestTheme;
  readonly onSelect: (theme: GuestTheme) => void;
  readonly className?: string;
}

export const ThemeSwitcher = ({ theme, onSelect, className }: ThemeSwitcherProps) => {
  const { t } = useGuestUi();

  return (
    <div
      role="group"
      aria-label={t('theme.label')}
      className={cn('bg-muted inline-flex items-center rounded-full p-0.5', className)}
    >
      {GUEST_THEMES.map((option) => {
        const { Icon, key } = OPTIONS[option];
        const isActive = option === theme;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={isActive}
            title={t(key)}
            onClick={() => {
              onSelect(option);
            }}
            className={cn(
              'focus-visible:ring-ring flex min-h-11 cursor-pointer items-center justify-center rounded-full px-3.5 transition-colors focus-visible:ring-2 focus-visible:outline-none sm:min-h-8 sm:px-3',
              isActive
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-4" />
            <span className="sr-only">{t(key)}</span>
          </button>
        );
      })}
    </div>
  );
};
