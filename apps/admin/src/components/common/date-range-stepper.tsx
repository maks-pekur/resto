import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DateRangePicker } from '@/components/common/date-range-picker';
import { fromDateKey, shiftDays, toDateKey, type DateRange } from '@/lib/date-range';
import { cn } from '@/lib/utils';

export interface DateRangeStepperProps {
  readonly value: DateRange;
  readonly onChange: (range: DateRange) => void;
  readonly className?: string;
}

const spanInDays = (range: DateRange): number =>
  Math.round((fromDateKey(range.to).getTime() - fromDateKey(range.from).getTime()) / 86_400_000) +
  1;

const shiftRange = (range: DateRange, days: number): DateRange => ({
  from: toDateKey(shiftDays(fromDateKey(range.from), days)),
  to: toDateKey(shiftDays(fromDateKey(range.to), days)),
});

/**
 * A day at a time with the arrows, any span with the calendar — the two ways an operator asks
 * for a different day, in one control.
 */
export function DateRangeStepper({ value, onChange, className }: DateRangeStepperProps) {
  const { t, i18n } = useTranslation('translation', { keyPrefix: 'orders' });
  const span = spanInDays(value);
  const today = toDateKey(new Date());
  const yesterday = toDateKey(shiftDays(new Date(), -1));

  const formatDay = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' });
  const label =
    value.from !== value.to
      ? `${formatDay.format(fromDateKey(value.from))} — ${formatDay.format(fromDateKey(value.to))}`
      : value.from === today
        ? t('dateNav.today')
        : value.from === yesterday
          ? t('dateNav.yesterday')
          : formatDay.format(fromDateKey(value.from));

  // One control, not three: the arrows and the calendar sit in a single bordered group, and the
  // date between them is the button that opens the calendar.
  return (
    <div className={cn('flex h-8 items-center overflow-hidden rounded-md border', className)}>
      <Button
        variant="ghost"
        size="icon"
        className="h-full rounded-none"
        aria-label={t('dateNav.previous')}
        onClick={() => {
          onChange(shiftRange(value, -span));
        }}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <DateRangePicker
        value={value}
        onChange={onChange}
        label={label}
        className="h-full min-w-28 justify-center rounded-none border-x border-y-0 px-2 text-xs shadow-none"
      />
      <Button
        variant="ghost"
        size="icon"
        className="h-full rounded-none"
        aria-label={t('dateNav.next')}
        // The future holds no orders, so the arrow stops at the day that does.
        disabled={value.to >= today}
        onClick={() => {
          onChange(shiftRange(value, span));
        }}
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}
