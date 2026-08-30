import * as React from 'react';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group';
import { cn } from '@/lib/utils';

export interface PrefixedInputProps extends Omit<
  React.ComponentProps<'input'>,
  'value' | 'onChange' | 'prefix'
> {
  /** The constant head of the value — shown, never typed, always stored. */
  readonly prefix: string;
  readonly value: string;
  readonly onValueChange: (next: string) => void;
}

/** Anything a person might paste instead of typing just the tail. */
const stripPrefix = (value: string, prefix: string): string => {
  const bare = (text: string): string => text.replace(/^https?:\/\//iu, '').replace(/^www\./iu, '');
  const barePrefix = bare(prefix);
  const bareValue = bare(value);
  return bareValue.toLowerCase().startsWith(barePrefix.toLowerCase())
    ? bareValue.slice(barePrefix.length)
    : bareValue;
};

export function PrefixedInput({
  prefix,
  value,
  onValueChange,
  className,
  ...props
}: PrefixedInputProps) {
  const tail = value.length === 0 ? '' : stripPrefix(value, prefix);

  return (
    <InputGroup className={className}>
      <InputGroupAddon>
        <InputGroupText className="text-muted-foreground font-normal">{prefix}</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput
        value={tail}
        onChange={(event) => {
          const next = stripPrefix(event.target.value, prefix);
          onValueChange(next.length === 0 ? '' : `${prefix}${next}`);
        }}
        className={cn('min-w-0', props.disabled === true && 'opacity-50')}
        {...props}
      />
    </InputGroup>
  );
}
