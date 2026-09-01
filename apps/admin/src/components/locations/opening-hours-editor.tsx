import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import type { OpeningHours } from '@/lib/queries/locations';

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

type Weekday = (typeof WEEKDAYS)[number];

interface DayRow {
  readonly open: boolean;
  readonly from: string;
  readonly to: string;
}

export type Week = Record<Weekday, DayRow>;

export const toWeek = (hours: OpeningHours | null): Week =>
  Object.fromEntries(
    WEEKDAYS.map((day) => {
      const first = hours?.[day]?.[0];
      return [
        day,
        { open: first !== undefined, from: first?.from ?? '10:00', to: first?.to ?? '22:00' },
      ];
    }),
  ) as Week;

export const toHours = (week: Week): OpeningHours =>
  Object.fromEntries(
    WEEKDAYS.map((day) => [
      day,
      week[day].open ? [{ from: week[day].from, to: week[day].to }] : [],
    ]),
  );

export interface OpeningHoursEditorProps {
  readonly value: Week;
  readonly onChange: (next: Week) => void;
}

export function OpeningHoursEditor({ value, onChange }: OpeningHoursEditorProps) {
  const { t } = useTranslation('translation', { keyPrefix: 'locations.hours' });

  const setDay = (day: Weekday, patch: Partial<DayRow>): void => {
    onChange({ ...value, [day]: { ...value[day], ...patch } });
  };

  return (
    <ul className="flex flex-col gap-2">
      {WEEKDAYS.map((day) => (
        <li key={day} className="flex items-center gap-3">
          <Switch
            id={`day-${day}`}
            checked={value[day].open}
            onCheckedChange={(open) => {
              setDay(day, { open });
            }}
          />
          <label htmlFor={`day-${day}`} className="w-28 text-sm font-medium">
            {t(`weekday.${day}`)}
          </label>
          {value[day].open ? (
            <div className="flex items-center gap-2">
              <Input
                type="time"
                className="w-32"
                value={value[day].from}
                onChange={(event) => {
                  setDay(day, { from: event.target.value });
                }}
              />
              <span className="text-muted-foreground">—</span>
              <Input
                type="time"
                className="w-32"
                value={value[day].to}
                onChange={(event) => {
                  setDay(day, { to: event.target.value });
                }}
              />
            </div>
          ) : (
            <span className="text-muted-foreground text-sm">{t('closed')}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
