import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { SOCIAL_PLATFORMS } from '@resto/domain';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { LocalizedField } from '@/components/common/localized-field';
import { LogoUpload } from '@/components/settings/logo-upload';
import { useContentLocales } from '@/hooks/use-content-locales';
import { showError, showSuccess } from '@/lib/ui/toast-helpers';
import { BrandFormSchema, withScheme, type BrandFormValues } from '@/lib/settings/brand-schema';
import { updateBrand, type TenantResponse } from '@/lib/queries/tenancy';

const SOCIAL_LABEL: Readonly<Record<string, string>> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  youtube: 'YouTube',
  x: 'X',
  tripadvisor: 'Tripadvisor',
};

const initialValues = (tenant: TenantResponse): BrandFormValues => ({
  displayName: tenant.displayName,
  description: tenant.description,
  phone: tenant.contacts.phone ?? '',
  email: tenant.contacts.email ?? '',
  website: tenant.contacts.website ?? '',
  socials: Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p, tenant.socials[p] ?? ''])),
  logoUrl: tenant.theme?.logoUrl ?? null,
  logoS3Key: null,
});

export interface BrandFormProps {
  readonly tenant: TenantResponse;
}

export function BrandForm({ tenant }: BrandFormProps) {
  const { t } = useTranslation('translation', { keyPrefix: 'settings.brand' });
  const { defaultLocale, locales } = useContentLocales();
  const queryClient = useQueryClient();
  const form = useForm<BrandFormValues>({
    resolver: zodResolver(BrandFormSchema),
    defaultValues: initialValues(tenant),
    mode: 'onBlur',
    reValidateMode: 'onChange',
  });

  React.useEffect(() => {
    form.reset(initialValues(tenant));
    // Resetting on every render would fight the operator's typing; only a new tenant payload counts.
  }, [tenant, form]);

  const mutation = useMutation({
    mutationFn: (values: BrandFormValues) =>
      updateBrand({
        displayName: values.displayName.trim(),
        description:
          values.description && Object.keys(values.description).length > 0
            ? values.description
            : null,
        contacts: {
          phone: values.phone.trim() || null,
          email: values.email.trim() || null,
          website: values.website.trim() ? withScheme(values.website) : null,
        },
        socials: Object.fromEntries(
          Object.entries(values.socials)
            .filter(([, url]) => url.trim().length > 0)
            .map(([platform, url]) => [platform, withScheme(url)]),
        ),
        ...(values.logoS3Key === null ? {} : { logoS3Key: values.logoS3Key }),
        ...(values.logoUrl === null && tenant.theme?.logoUrl ? { logoS3Key: null } : {}),
      }),
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

  const onSubmit = form.handleSubmit((values) => {
    mutation.mutate(values);
  });

  const messageFor = (key: string | undefined): string | undefined =>
    key === undefined ? undefined : t(key);

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        void onSubmit(event);
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>{t('profileTitle')}</CardTitle>
          <CardDescription>{t('profileDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <LogoUpload
              logoUrl={form.watch('logoUrl')}
              onUploaded={(s3Key, previewUrl) => {
                form.setValue('logoS3Key', s3Key, { shouldDirty: true });
                form.setValue('logoUrl', previewUrl, { shouldDirty: true });
              }}
              onCleared={() => {
                form.setValue('logoS3Key', null, { shouldDirty: true });
                form.setValue('logoUrl', null, { shouldDirty: true });
              }}
            />

            <Field data-invalid={form.formState.errors.displayName ? true : undefined}>
              <FieldLabel htmlFor="brand-name">{t('nameLabel')}</FieldLabel>
              <Input id="brand-name" maxLength={120} {...form.register('displayName')} />
              <FieldDescription>{t('nameHint')}</FieldDescription>
              {form.formState.errors.displayName ? (
                <FieldError>{messageFor(form.formState.errors.displayName.message)}</FieldError>
              ) : null}
            </Field>

            <LocalizedField
              id="brand-description"
              label={t('descriptionLabel')}
              value={form.watch('description')}
              onChange={(next) => {
                form.setValue('description', next, { shouldDirty: true });
              }}
              locales={locales}
              defaultLocale={defaultLocale}
              multiline
              nullable
              maxLength={2000}
              description={t('descriptionHint')}
            />
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('contactsTitle')}</CardTitle>
          <CardDescription>{t('contactsDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field data-invalid={form.formState.errors.phone ? true : undefined}>
              <FieldLabel htmlFor="brand-phone">{t('phoneLabel')}</FieldLabel>
              <Input id="brand-phone" inputMode="tel" {...form.register('phone')} />
              {form.formState.errors.phone ? (
                <FieldError>{messageFor(form.formState.errors.phone.message)}</FieldError>
              ) : null}
            </Field>
            <Field data-invalid={form.formState.errors.email ? true : undefined}>
              <FieldLabel htmlFor="brand-email">{t('emailLabel')}</FieldLabel>
              <Input id="brand-email" inputMode="email" {...form.register('email')} />
              {form.formState.errors.email ? (
                <FieldError>{messageFor(form.formState.errors.email.message)}</FieldError>
              ) : null}
            </Field>
            <Field data-invalid={form.formState.errors.website ? true : undefined}>
              <FieldLabel htmlFor="brand-website">{t('websiteLabel')}</FieldLabel>
              <Input id="brand-website" inputMode="url" {...form.register('website')} />
              <FieldDescription>{t('websiteHint')}</FieldDescription>
              {form.formState.errors.website ? (
                <FieldError>{messageFor(form.formState.errors.website.message)}</FieldError>
              ) : null}
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('socialsTitle')}</CardTitle>
          <CardDescription>{t('socialsDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {SOCIAL_PLATFORMS.map((platform) => {
              const error = form.formState.errors.socials?.[platform];
              return (
                <Field key={platform} data-invalid={error ? true : undefined}>
                  <FieldLabel htmlFor={`social-${platform}`}>
                    {SOCIAL_LABEL[platform] ?? platform}
                  </FieldLabel>
                  <Input
                    id={`social-${platform}`}
                    inputMode="url"
                    placeholder={t('socialPlaceholder')}
                    {...form.register(`socials.${platform}`)}
                  />
                  {error ? <FieldError>{messageFor(error.message)}</FieldError> : null}
                </Field>
              );
            })}
          </FieldGroup>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        {form.formState.isDirty ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              form.reset(initialValues(tenant));
            }}
          >
            {t('reset')}
          </Button>
        ) : null}
        <Button type="submit" disabled={mutation.isPending || !form.formState.isDirty}>
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
