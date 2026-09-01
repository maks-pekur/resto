import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { SettingsSection } from '@/components/settings/settings-section';
import { showError, showSuccess } from '@/lib/ui/toast-helpers';
import { updateBrand, type OpeningHours, type TenantResponse } from '@/lib/queries/tenancy';

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

interface DayRow {
  readonly open: boolean;
  readonly from: string;
  readonly to: string;
}

type Week = Record<(typeof WEEKDAYS)[number], DayRow>;

const toWeek = (hours: OpeningHours | null): Week =>
  Object.fromEntries(
    WEEKDAYS.map((day) => {
      const first = hours?.[day]?.[0];
      return [
        day,
        { open: first !== undefined, from: first?.from ?? '10:00', to: first?.to ?? '22:00' },
      ];
    }),
  ) as Week;

const toHours = (week: Week): OpeningHours =>
  Object.fromEntries(
    WEEKDAYS.map((day) => [
      day,
      week[day].open ? [{ from: week[day].from, to: week[day].to }] : [],
    ]),
  );

export interface HoursFormProps {
  readonly tenant: TenantResponse;
}

export function HoursForm({ tenant }: HoursFormProps) {
  const { t } = useTranslation('translation', { keyPrefix: 'settings.hours' });
  const queryClient = useQueryClient();

  const [week, setWeek] = React.useState<Week>(() => toWeek(tenant.openingHours));
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    setWeek(toWeek(tenant.openingHours));
    setDirty(false);
  }, [tenant]);

  const mutation = useMutation({
    mutationFn: () => updateBrand({ openingHours: toHours(week) }),
    onSuccess: (res) => {
      if (!res.ok) {
        showError(null, t('saveFailed'));
        return;
      }
      showSuccess(t('saved'));
      setDirty(false);
      void queryClient.invalidateQueries({ queryKey: ['tenancy', 'me'] });
    },
    onError: () => {
      showError(null, t('saveFailed'));
    },
  });

  const setDay = (day: (typeof WEEKDAYS)[number], patch: Partial<DayRow>): void => {
    setWeek((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } }));
    setDirty(true);
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <SettingsSection title={t('title')} description={t('description')}>
        <ul className="flex flex-col gap-2">
          {WEEKDAYS.map((day) => (
            <li key={day} className="flex items-center gap-3">
              <Switch
                id={`day-${day}`}
                checked={week[day].open}
                onCheckedChange={(open) => {
                  setDay(day, { open });
                }}
              />
              <label htmlFor={`day-${day}`} className="w-28 text-sm font-medium">
                {t(`weekday.${day}`)}
              </label>
              {week[day].open ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="time"
                    className="w-32"
                    value={week[day].from}
                    onChange={(event) => {
                      setDay(day, { from: event.target.value });
                    }}
                  />
                  <span className="text-muted-foreground">—</span>
                  <Input
                    type="time"
                    className="w-32"
                    value={week[day].to}
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
      </SettingsSection>

      <div className="flex justify-end">
        <Button type="submit" disabled={mutation.isPending || !dirty}>
          {mutation.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t('saving')}
            </>
          ) : (
            t('save')
          )}
        </Button>
      </div>
    </form>
  );
}
