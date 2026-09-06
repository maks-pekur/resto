'use client';

import { useTranslations } from 'next-intl';
import { ThemeToggle } from '@resto/ui';
import { useSiteTheme } from '@/components/guest-ui';

export function ThemeControl({ className = '' }: { className?: string }) {
  const t = useTranslations('theme');
  const { resolvedTheme, toggleTheme } = useSiteTheme();

  return (
    <ThemeToggle
      resolvedTheme={resolvedTheme}
      onToggle={toggleTheme}
      label={t('label')}
      className={className}
    />
  );
}
