'use client';

import { cn } from '../lib/utils';

export interface SegmentedOption {
  readonly id: string;
  readonly label: string;
  /** Rendered under the label — a price difference, for instance. */
  readonly note?: string | null;
}

export interface SegmentedChoiceProps {
  readonly name: string;
  readonly options: readonly SegmentedOption[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  readonly className?: string;
}

/**
 * One answer out of a few, as a track with a pill that slides to it. Sizes and single-choice
 * modifier groups are the same question in the guest's eyes, so they are the same control.
 */
export const SegmentedChoice = ({
  name,
  options,
  selectedId,
  onSelect,
  className,
}: SegmentedChoiceProps) => {
  const selectedIndex = Math.max(
    options.findIndex((option) => option.id === selectedId),
    0,
  );

  return (
    <div className={cn('bg-muted relative flex rounded-full p-0.5', className)}>
      <span
        aria-hidden
        className={cn(
          'bg-background ring-primary/30 absolute inset-y-0.5 start-0.5 rounded-full shadow-sm ring-1 transition-transform duration-200 ease-out',
          selectedId === null && 'opacity-0',
        )}
        style={{
          width: `calc((100% - 0.25rem) / ${String(options.length)})`,
          transform: `translateX(${String(selectedIndex * 100)}%)`,
        }}
      />
      {options.map((option) => (
        <label
          key={option.id}
          className="has-[:checked]:text-foreground text-muted-foreground has-[:focus-visible]:ring-ring relative z-10 flex min-h-11 flex-1 cursor-pointer flex-col items-center justify-center rounded-full px-3 py-2 text-center text-xs font-bold transition-colors has-[:focus-visible]:ring-2"
        >
          <input
            type="radio"
            className="sr-only"
            name={name}
            value={option.id}
            checked={selectedId === option.id}
            onChange={() => {
              onSelect(option.id);
            }}
          />
          <span className="truncate">{option.label}</span>
          {option.note === null || option.note === undefined ? null : (
            <span className="text-muted-foreground text-[0.625rem] leading-tight font-semibold tabular-nums">
              {option.note}
            </span>
          )}
        </label>
      ))}
    </div>
  );
};
