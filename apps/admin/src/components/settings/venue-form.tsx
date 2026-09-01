import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { SettingsSection } from '@/components/settings/settings-section';
import { CoverUpload } from '@/components/settings/cover-upload';
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

export interface VenueFormProps {
  readonly tenant: TenantResponse;
}

export function VenueForm({ tenant }: VenueFormProps) {
  const { t } = useTranslation('translation', { keyPrefix: 'settings.venue' });
  const queryClient = useQueryClient();

  const [week, setWeek] = React.useState<Week>(() => toWeek(tenant.openingHours));
  const [ssid, setSsid] = React.useState(tenant.wifi?.ssid ?? '');
  const [password, setPassword] = React.useState(tenant.wifi?.password ?? '');
  const [coverUrl, setCoverUrl] = React.useState<string | null>(tenant.theme?.coverUrl ?? null);
  const [coverS3Key, setCoverS3Key] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    setWeek(toWeek(tenant.openingHours));
    setSsid(tenant.wifi?.ssid ?? '');
    setPassword(tenant.wifi?.password ?? '');
    setCoverUrl(tenant.theme?.coverUrl ?? null);
    setCoverS3Key(null);
    setDirty(false);
  }, [tenant]);

  const mutation = useMutation({
    mutationFn: () =>
      updateBrand({
        openingHours: toHours(week),
        wifi:
          ssid.trim().length === 0
            ? null
            : { ssid: ssid.trim(), password: password.trim() || null },
        ...(coverS3Key === null ? {} : { coverS3Key }),
        ...(coverUrl === null && tenant.theme?.coverUrl ? { coverS3Key: null } : {}),
      }),
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
      <SettingsSection title={t('coverTitle')} description={t('coverDescription')}>
        <CoverUpload
          coverUrl={coverUrl}
          onUploaded={(key, preview) => {
            setCoverS3Key(key);
            setCoverUrl(preview);
            setDirty(true);
          }}
          onCleared={() => {
            setCoverS3Key(null);
            setCoverUrl(null);
            setDirty(true);
          }}
        />
      </SettingsSection>

      <SettingsSection title={t('hoursTitle')} description={t('hoursDescription')}>
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

      <SettingsSection title={t('wifiTitle')} description={t('wifiDescription')}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="wifi-ssid">{t('ssidLabel')}</FieldLabel>
            <Input
              id="wifi-ssid"
              maxLength={64}
              value={ssid}
              onChange={(event) => {
                setSsid(event.target.value);
                setDirty(true);
              }}
            />
            <FieldDescription>{t('ssidHint')}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="wifi-password">{t('passwordLabel')}</FieldLabel>
            <Input
              id="wifi-password"
              maxLength={128}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setDirty(true);
              }}
            />
          </Field>
        </FieldGroup>
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
