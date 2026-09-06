export interface DateRange {
  readonly from: string;
  readonly to: string;
}

export type DateRangePresetId =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last28'
  | 'thisMonth'
  | 'lastMonth';

const KEY_FORMAT = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export const toDateKey = (date: Date): string => KEY_FORMAT.format(date);

// Parsed as local midnight — the guest-facing day the operator sees on their own clock,
// not a UTC instant that shifts the date west of Greenwich.
export const fromDateKey = (key: string): Date => new Date(`${key}T00:00:00`);

export const shiftDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const startOfMonth = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), 1);

export const buildPresetRange = (id: DateRangePresetId, today: Date = new Date()): DateRange => {
  switch (id) {
    case 'today':
      return { from: toDateKey(today), to: toDateKey(today) };
    case 'yesterday': {
      const key = toDateKey(shiftDays(today, -1));
      return { from: key, to: key };
    }
    case 'last7':
      return { from: toDateKey(shiftDays(today, -6)), to: toDateKey(today) };
    case 'last28':
      return { from: toDateKey(shiftDays(today, -27)), to: toDateKey(today) };
    case 'thisMonth':
      return { from: toDateKey(startOfMonth(today)), to: toDateKey(today) };
    case 'lastMonth': {
      const firstOfThisMonth = startOfMonth(today);
      const lastMonthEnd = shiftDays(firstOfThisMonth, -1);
      return { from: toDateKey(startOfMonth(lastMonthEnd)), to: toDateKey(lastMonthEnd) };
    }
  }
};

export const DATE_RANGE_PRESETS: readonly DateRangePresetId[] = [
  'today',
  'yesterday',
  'last7',
  'last28',
  'thisMonth',
  'lastMonth',
];

export const matchingPreset = (
  range: DateRange,
  today: Date = new Date(),
): DateRangePresetId | null =>
  DATE_RANGE_PRESETS.find((id) => {
    const preset = buildPresetRange(id, today);
    return preset.from === range.from && preset.to === range.to;
  }) ?? null;

export const DEFAULT_DASHBOARD_RANGE = (today: Date = new Date()): DateRange =>
  buildPresetRange('today', today);
