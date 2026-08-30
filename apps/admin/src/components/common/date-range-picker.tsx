import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarIcon } from 'lucide-react';
import type { DateRange as CalendarRange } from 'react-day-picker';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DATE_RANGE_PRESETS,
  buildPresetRange,
  fromDateKey,
  matchingPreset,
  toDateKey,
  type DateRange,
} from '@/lib/date-range';
import { cn } from '@/lib/utils';

export interface DateRangePickerProps {
  readonly value: DateRange;
  readonly onChange: (range: DateRange) => void;
  readonly className?: string;
  /** `icon` drops the label — for toolbars that already say which dates are shown. */
  readonly trigger?: 'label' | 'icon';
}

export function DateRangePicker({
  value,
  onChange,
  className,
  trigger = 'label',
}: DateRangePickerProps) {
  const { t, i18n } = useTranslation('translation', { keyPrefix: 'dashboard' });
  const [open, setOpen] = useState(false);

  const formatDay = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' });
  const label =
    value.from === value.to
      ? formatDay.format(fromDateKey(value.from))
      : `${formatDay.format(fromDateKey(value.from))} — ${formatDay.format(fromDateKey(value.to))}`;

  const active = matchingPreset(value);
  const selected: CalendarRange = { from: fromDateKey(value.from), to: fromDateKey(value.to) };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger === 'icon' ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('rangePickerLabel')}
            className={className}
          >
            <CalendarIcon className="size-4" />
          </Button>
        ) : (
          <Button variant="outline" size="sm" className={cn('gap-2 font-normal', className)}>
            <CalendarIcon className="size-4 opacity-70" />
            <span>{active === null ? label : t(`range.${active}`)}</span>
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-auto flex-col gap-2 p-2 sm:flex-row">
        <div className="flex flex-row flex-wrap gap-1 sm:w-40 sm:flex-col">
          {DATE_RANGE_PRESETS.map((id) => (
            <Button
              key={id}
              type="button"
              variant="ghost"
              size="sm"
              className={cn('justify-start font-normal', active === id && 'bg-accent')}
              onClick={() => {
                onChange(buildPresetRange(id));
                setOpen(false);
              }}
            >
              {t(`range.${id}`)}
            </Button>
          ))}
        </div>
        <Calendar
          mode="range"
          selected={selected}
          defaultMonth={selected.from}
          numberOfMonths={1}
          disabled={{ after: new Date() }}
          onSelect={(next) => {
            if (!next?.from) return;
            onChange({ from: toDateKey(next.from), to: toDateKey(next.to ?? next.from) });
            if (next.to) setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
