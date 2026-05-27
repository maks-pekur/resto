import * as React from 'react';
import { Inbox, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

type EmptyStateVariant = 'empty' | 'forbidden';

export interface EmptyStateProps {
  readonly variant: EmptyStateVariant;
  readonly title: string;
  readonly description: string;
  readonly action?: React.ReactNode;
  readonly icon?: React.ReactNode;
  readonly className?: string;
}

/**
 * Empty / forbidden state. Voice: calm, operator-respectful, no exclamation
 * marks, 1-2 sentences max. Per CONTEXT D-08 — voice locked for all of MVP-1.
 */
export function EmptyState({
  variant,
  title,
  description,
  action,
  icon,
  className,
}: EmptyStateProps) {
  const DefaultIcon = variant === 'empty' ? Inbox : Lock;
  return (
    <div
      role={variant === 'forbidden' ? 'alert' : 'status'}
      className={cn(
        'flex flex-col items-center justify-center gap-4 px-6 py-12 text-center',
        className,
      )}
    >
      <div
        className={cn(
          'flex size-12 items-center justify-center rounded-full',
          variant === 'empty'
            ? 'bg-muted text-muted-foreground'
            : 'bg-destructive/10 text-destructive',
        )}
        aria-hidden="true"
      >
        {icon ?? <DefaultIcon className="size-6" />}
      </div>
      <div className="max-w-md space-y-1.5">
        <h2 className="text-lg font-medium">{title}</h2>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}
