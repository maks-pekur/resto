import type { ComponentType } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface IconToggleProps {
  readonly pressed: boolean;
  readonly onPressedChange: (pressed: boolean) => void;
  readonly onIcon: ComponentType<{ className?: string }>;
  readonly offIcon: ComponentType<{ className?: string }>;
  readonly label: string;
  readonly className?: string;
}

/**
 * One button that carries its own state in its icon — the same shape as the theme toggle, and
 * the reason neither control needs a label beside it to be understood.
 */
export function IconToggle({
  pressed,
  onPressedChange,
  onIcon: OnIcon,
  offIcon: OffIcon,
  label,
  className,
}: IconToggleProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={cn('relative rounded-full', className)}
      onClick={() => {
        onPressedChange(!pressed);
      }}
    >
      <OnIcon
        className={cn(
          'absolute size-[1.1rem] transition-all duration-200',
          pressed ? 'scale-100 rotate-0' : 'scale-0 -rotate-90',
        )}
      />
      <OffIcon
        className={cn(
          'text-muted-foreground absolute size-[1.1rem] transition-all duration-200',
          pressed ? 'scale-0 rotate-90' : 'scale-100 rotate-0',
        )}
      />
    </Button>
  );
}
