'use client';

import { cn } from '../lib/utils';

export interface PillMultiChoiceOption {
  readonly id: string;
  readonly label: string;
  /** Rendered under the label — a price difference, for instance. */
  readonly note?: string | null;
}

export interface PillMultiChoiceProps {
  readonly name: string;
  readonly options: readonly PillMultiChoiceOption[];
  readonly selectedIds: ReadonlySet<string>;
  readonly onToggle: (id: string) => void;
  readonly unavailableIds?: ReadonlySet<string>;
  readonly className?: string;
}

/**
 * The `tabs` + `several` variant `SegmentedChoice` cannot express: no single active index, so no
 * shared sliding highlight — each pill owns its own selected background instead.
 */
export const PillMultiChoice = ({
  name,
  options,
  selectedIds,
  onToggle,
  unavailableIds,
  className,
}: PillMultiChoiceProps) => (
  <div className={cn('bg-muted flex flex-wrap gap-1 rounded-2xl p-1', className)}>
    {options.map((option) => {
      const selected = selectedIds.has(option.id);
      const unavailable = unavailableIds?.has(option.id) ?? false;
      return (
        <label
          key={option.id}
          className={cn(
            'has-[:focus-visible]:ring-ring inline-flex min-h-9 cursor-pointer flex-col items-center justify-center gap-0 rounded-full px-3 py-1.5 text-center text-sm font-bold transition-colors has-[:focus-visible]:ring-2',
            selected
              ? 'bg-background text-foreground shadow-sm ring-1 ring-primary/30'
              : 'text-muted-foreground',
            unavailable && 'cursor-not-allowed opacity-45',
          )}
        >
          <input
            type="checkbox"
            className="sr-only"
            name={name}
            value={option.id}
            checked={selected}
            disabled={unavailable}
            onChange={() => {
              onToggle(option.id);
            }}
          />
          <span className="truncate">{option.label}</span>
          {option.note === null || option.note === undefined ? null : (
            <span className="text-muted-foreground text-[0.625rem] leading-tight font-semibold tabular-nums">
              {option.note}
            </span>
          )}
        </label>
      );
    })}
  </div>
);
