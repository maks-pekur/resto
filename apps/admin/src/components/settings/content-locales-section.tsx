import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CONTENT_LOCALES } from '@resto/domain';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MultiSelect } from '@/components/common/multi-select';
import { LocaleDisc } from '@/components/common/locale-disc';
import { localeName } from '@/lib/i18n/content-locales';
import { showError, showSuccess } from '@/lib/ui/toast-helpers';
import { setContentLocales } from '@/lib/queries/tenancy';

export interface ContentLocalesSectionProps {
  readonly defaultLocale: string;
  readonly contentLocales: readonly string[];
}

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((value) => b.includes(value));

export function ContentLocalesSection({
  defaultLocale,
  contentLocales,
}: ContentLocalesSectionProps) {
  const { t, i18n } = useTranslation('translation', { keyPrefix: 'settings.contentLocales' });
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<readonly string[]>(contentLocales);
  const [primary, setPrimary] = useState(defaultLocale);

  const dirty = !sameSet(selected, contentLocales) || primary !== defaultLocale;

  const mutation = useMutation({
    mutationFn: () => setContentLocales({ defaultLocale: primary, contentLocales: selected }),
    onSuccess: (res) => {
      if (!res.ok) {
        showError(null, t('saveFailed'));
        return;
      }
      showSuccess(t('saved'));
      void queryClient.invalidateQueries({ queryKey: ['tenancy', 'me'] });
    },
    onError: () => {
      showError(null, t('saveFailed'));
    },
  });

  const options = CONTENT_LOCALES.map((locale) => ({
    value: locale,
    label: locale.toUpperCase(),
    // The full name still reaches a screen reader; sighted operators read the flag faster.
    title: localeName(locale, i18n.language),
    icon: <LocaleDisc locale={locale} withCode={false} className="[&>span]:size-5" />,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="content-locales">{t('languagesLabel')}</FieldLabel>
            <MultiSelect
              id="content-locales"
              options={options}
              value={[...selected]}
              placeholder={t('languagesPlaceholder')}
              // The fallback every guest lands on cannot be switched off from under them.
              locked={[primary]}
              onChange={setSelected}
            />
            <FieldDescription>{t('fallbackHint')}</FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="content-default-locale">{t('primaryLabel')}</FieldLabel>
            <Select
              value={primary}
              onValueChange={(next) => {
                setPrimary(next);
                setSelected((prev) => (prev.includes(next) ? prev : [...prev, next]));
              }}
            >
              <SelectTrigger id="content-default-locale" className="w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options
                  .filter((option) => selected.includes(option.value))
                  .map((option) => (
                    <SelectItem key={option.value} value={option.value} title={option.title}>
                      <span className="flex items-center gap-2">
                        {option.icon}
                        {option.label}
                      </span>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>

        <div className="flex justify-end gap-2">
          {dirty ? (
            <Button
              variant="ghost"
              onClick={() => {
                setSelected(contentLocales);
                setPrimary(defaultLocale);
              }}
            >
              {t('reset')}
            </Button>
          ) : null}
          <Button
            disabled={!dirty || mutation.isPending}
            onClick={() => {
              mutation.mutate();
            }}
          >
            {mutation.isPending ? t('saving') : t('save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
