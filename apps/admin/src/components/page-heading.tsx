import * as React from 'react';
import { cn } from '@/lib/utils';

export interface PageHeadingProps {
  readonly title: string;
  readonly description?: string;
  readonly action?: React.ReactNode;
  readonly className?: string;
}

export function PageHeading({
  title,
  description,
  action,
  className,
}: PageHeadingProps): React.ReactElement {
  return (
    <div
      data-slot="page-heading"
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.75rem',
        width: '100%',
      }}
      className={cn('px-4 lg:px-6', className)}
    >
      <div style={{ minWidth: 0, flex: '1 1 0' }} className="flex flex-col gap-0.5">
        <h1 className="truncate text-2xl font-semibold leading-tight tracking-tight">{title}</h1>
        {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
      </div>
      {action ? (
        <div style={{ flexShrink: 0 }} className="flex items-center gap-2">
          {action}
        </div>
      ) : null}
    </div>
  );
}
