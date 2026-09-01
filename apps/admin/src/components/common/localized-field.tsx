import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { LocaleDisc } from '@/components/common/locale-disc';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { LocalizedText } from '@/lib/menu/localized';

export interface LocalizedFieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: LocalizedText | null;
  readonly onChange: (next: LocalizedText | null) => void;
  readonly locales: readonly string[];
  readonly defaultLocale: string;
  readonly multiline?: boolean;
  readonly rows?: number;
  readonly maxLength?: number;
  readonly nullable?: boolean;
  readonly description?: React.ReactNode;
  readonly error?: string | undefined;
  readonly onBlur?: () => void;
}

const filled = (value: LocalizedText | null, locale: string): boolean =>
  (value?.[locale] ?? '').trim().length > 0;

export function LocalizedField({
  id,
  label,
  value,
  onChange,
  locales,
  defaultLocale,
  multiline = false,
  rows = 4,
  maxLength,
  nullable = false,
  description,
  error,
  onBlur,
}: LocalizedFieldProps) {
  const { t } = useTranslation('translation', { keyPrefix: 'common.localizedField' });
  const [active, setActive] = React.useState(defaultLocale);
  const current = locales.includes(active) ? active : defaultLocale;
  const translated = locales.filter((locale) => filled(value, locale)).length;

  const write = (text: string): void => {
    const next: LocalizedText = Object.fromEntries(
      Object.entries(value ?? {}).filter(([locale]) => locale !== current),
    );
    if (text.length > 0) next[current] = text;
    onChange(nullable && Object.keys(next).length === 0 ? null : next);
  };

  const controlProps = {
    id,
    value: value?.[current] ?? '',
    'aria-invalid': error === undefined ? undefined : true,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      write(event.target.value);
    },
    ...(maxLength === undefined ? {} : { maxLength }),
    ...(onBlur === undefined ? {} : { onBlur }),
  };

  return (
    <Field data-invalid={error === undefined ? undefined : true}>
      <div className="flex items-center justify-between gap-3">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {locales.length > 1 ? (
          <span className="text-muted-foreground text-xs">
            {t('translatedCount', { done: translated, total: locales.length })}
          </span>
        ) : null}
      </div>

      {locales.length > 1 ? (
        <Tabs
          value={current}
          onValueChange={(locale) => {
            setActive(locale);
          }}
        >
          <TabsList aria-label={label}>
            {locales.map((locale) => (
              <TabsTrigger
                key={locale}
                value={locale}
                data-testid={`${id}-tab-${locale}`}
                className="gap-1.5"
              >
                <LocaleDisc locale={locale} withCode={false} className="[&>span]:size-4" />
                <span className="uppercase">{locale}</span>
                {locale === defaultLocale ? (
                  <span className="opacity-70">{t('primaryMark')}</span>
                ) : filled(value, locale) ? (
                  <Check className="size-3" />
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      ) : null}

      {multiline ? <Textarea rows={rows} {...controlProps} /> : <Input {...controlProps} />}

      {description === undefined ? null : <FieldDescription>{description}</FieldDescription>}
      {error === undefined ? null : <FieldError>{error}</FieldError>}
    </Field>
  );
}
