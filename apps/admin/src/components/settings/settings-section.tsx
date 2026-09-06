import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface SettingsSectionProps {
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
  readonly className?: string;
}

/** A settings group is a heading and its fields — the page is the frame, so it needs no card. */
export function SettingsSection({ title, description, children, className }: SettingsSectionProps) {
  return (
    <section
      className={cn('flex flex-col gap-4 border-b pb-6 last:border-b-0 last:pb-0', className)}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">{title}</h2>
        {description === undefined ? null : (
          <p className="text-muted-foreground text-sm">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}
