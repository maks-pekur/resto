import type { ComponentType } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface RowAction {
  readonly key: string;
  readonly label: string;
  readonly icon?: ComponentType<{ className?: string }>;
  readonly tone?: 'default' | 'destructive';
  readonly disabled?: boolean;
  readonly onSelect: () => void;
}

export interface RowActionsProps {
  readonly actions: readonly RowAction[];
  readonly label: string;
}

/**
 * Every row action in one menu behind one button. A row with nothing to offer renders no
 * trigger at all rather than a menu that opens onto an apology.
 */
export function RowActions({ actions, label }: RowActionsProps) {
  if (actions.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <DropdownMenuItem
              key={action.key}
              disabled={action.disabled}
              variant={action.tone === 'destructive' ? 'destructive' : 'default'}
              onSelect={() => {
                action.onSelect();
              }}
            >
              {Icon ? <Icon className="size-4" /> : null}
              {action.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
