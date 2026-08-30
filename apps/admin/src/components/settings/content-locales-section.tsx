import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { CONTENT_LOCALES, type ContentLocale } from '@resto/domain';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
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

  const toggle = (locale: ContentLocale, on: boolean): void => {
    setSelected((prev) => {
      if (on) return prev.includes(locale) ? prev : [...prev, locale];
      // The fallback every guest lands on cannot be switched off from under them.
      if (locale === primary) return prev;
      return prev.filter((value) => value !== locale);
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="divide-y rounded-md border">
          {CONTENT_LOCALES.map((locale) => {
            const enabled = selected.includes(locale);
            const isPrimary = locale === primary;
            return (
              <li
                key={locale}
                data-testid={`content-locale-${locale}`}
                className="flex items-center gap-3 px-3 py-2.5"
              >
                <LocaleDisc locale={locale} />
                <span className="flex-1 truncate text-sm capitalize">
                  {localeName(locale, i18n.language)}
                </span>
                {isPrimary ? (
                  <Badge variant="secondary" className="gap-1">
                    <Star className="size-3" />
                    {t('primaryBadge')}
                  </Badge>
                ) : enabled ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setPrimary(locale);
                    }}
                  >
                    {t('makePrimary')}
                  </Button>
                ) : null}
                <Switch
                  checked={enabled}
                  disabled={isPrimary}
                  aria-label={localeName(locale, i18n.language)}
                  onCheckedChange={(next) => {
                    toggle(locale, next);
                  }}
                />
              </li>
            );
          })}
        </ul>

        <p className="text-muted-foreground text-sm">{t('fallbackHint')}</p>

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
