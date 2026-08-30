import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface MultiSelectOption {
  readonly value: string;
  readonly label: string;
  readonly icon?: React.ReactNode;
}

export interface MultiSelectProps {
  readonly id?: string;
  readonly options: readonly MultiSelectOption[];
  readonly value: readonly string[];
  readonly onChange: (next: string[]) => void;
  readonly placeholder: string;
  readonly ariaLabel?: string;
  /** Values that cannot be unchecked — something else depends on them. */
  readonly locked?: readonly string[];
  readonly className?: string;
}

export function MultiSelect({
  id,
  options,
  value,
  onChange,
  placeholder,
  ariaLabel,
  locked = [],
  className,
}: MultiSelectProps) {
  const selected = options.filter((option) => value.includes(option.value));

  const toggle = (option: string): void => {
    if (value.includes(option)) {
      if (locked.includes(option)) return;
      onChange(value.filter((v) => v !== option));
      return;
    }
    onChange([...value, option]);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        id={id}
        aria-label={ariaLabel ?? placeholder}
        className={cn(
          'border-input bg-background focus-visible:ring-ring/50 flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm shadow-xs transition focus-visible:ring-[3px] focus-visible:outline-none',
          className,
        )}
      >
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {selected.length === 0 ? (
            <span className="text-muted-foreground">{placeholder}</span>
          ) : (
            selected.map((option) => (
              <Badge key={option.value} variant="secondary" className="gap-1 font-normal">
                {option.icon}
                {option.label}
              </Badge>
            ))
          )}
        </span>
        <ChevronDown className="text-muted-foreground size-4 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[--radix-dropdown-menu-trigger-width]">
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={value.includes(option.value)}
            disabled={value.includes(option.value) && locked.includes(option.value)}
            data-testid={`multi-select-option-${option.value}`}
            // Radix closes the menu on select; a multi-select is the one place that is wrong.
            onSelect={(event) => {
              event.preventDefault();
            }}
            onCheckedChange={() => {
              toggle(option.value);
            }}
            className="gap-2"
          >
            {option.icon}
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
