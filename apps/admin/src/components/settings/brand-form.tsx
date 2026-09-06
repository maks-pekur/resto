import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, X } from 'lucide-react';
import { SOCIAL_PLATFORMS } from '@resto/domain';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { SettingsSection } from '@/components/settings/settings-section';
import { LocalizedField } from '@/components/common/localized-field';
import { PrefixedInput } from '@/components/common/prefixed-input';
import { socialPresentation } from '@/lib/settings/socials';
import { LogoUpload } from '@/components/settings/logo-upload';
import { CoverUpload } from '@/components/settings/cover-upload';
import { useContentLocales } from '@/hooks/use-content-locales';
import { showError, showSuccess } from '@/lib/ui/toast-helpers';
import { BrandFormSchema, withScheme, type BrandFormValues } from '@/lib/settings/brand-schema';
import { updateBrand, type TenantResponse } from '@/lib/queries/tenancy';

const initialValues = (tenant: TenantResponse): BrandFormValues => ({
  displayName: tenant.displayName,
  description: tenant.description,
  phone: tenant.contacts.phone ?? '',
  email: tenant.contacts.email ?? '',
  website: tenant.contacts.website ?? '',
  // Only the profiles the restaurant actually has: the rest are offered by the add menu.
  socials: Object.fromEntries(
    SOCIAL_PLATFORMS.filter((platform) => (tenant.socials[platform] ?? '').length > 0).map(
      (platform) => [platform, tenant.socials[platform] ?? ''],
    ),
  ),
  logoUrl: tenant.theme?.logoUrl ?? null,
  logoS3Key: null,
  photos: [...(tenant.theme?.coverUrls ?? [])],
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
        coverS3Keys: values.photos,
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

  const [lastAdded, setLastAdded] = React.useState<string | null>(null);
  // The restaurant's own slug is already url-safe, so it reads as a real example of the link.
  const handle = tenant.slug;
  const socials = form.watch('socials');
  const addedSocials = SOCIAL_PLATFORMS.filter((platform) => platform in socials);
  const availableSocials = SOCIAL_PLATFORMS.filter((platform) => !(platform in socials));

  const addSocial = (platform: (typeof SOCIAL_PLATFORMS)[number]): void => {
    form.setValue('socials', { ...socials, [platform]: '' }, { shouldDirty: true });
    setLastAdded(platform);
  };

  const removeSocial = (platform: string): void => {
    form.setValue(
      'socials',
      Object.fromEntries(Object.entries(socials).filter(([key]) => key !== platform)),
      { shouldDirty: true },
    );
  };

  const onSubmit = form.handleSubmit((values) => {
    mutation.mutate(values);
  });

  const messageFor = (key: string | undefined): string | undefined =>
    key === undefined ? undefined : t(key);

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        void onSubmit(event);
      }}
    >
      <SettingsSection title={t('profileTitle')} description={t('profileDescription')}>
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

          <CoverUpload
            photos={form.watch('photos')}
            onChange={(next) => {
              form.setValue('photos', [...next], { shouldDirty: true });
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
      </SettingsSection>

      <SettingsSection title={t('contactsTitle')} description={t('contactsDescription')}>
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
            <PrefixedInput
              id="brand-website"
              inputMode="url"
              prefix="https://"
              placeholder={`${handle}.com`}
              value={form.watch('website')}
              onValueChange={(next) => {
                form.setValue('website', next, { shouldDirty: true, shouldValidate: true });
              }}
            />
            {form.formState.errors.website ? (
              <FieldError>{messageFor(form.formState.errors.website.message)}</FieldError>
            ) : null}
          </Field>
        </FieldGroup>
      </SettingsSection>

      <SettingsSection title={t('socialsTitle')} description={t('socialsDescription')}>
        <FieldGroup>
          {addedSocials.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('socialsEmpty')}</p>
          ) : (
            addedSocials.map((platform) => {
              const error = form.formState.errors.socials?.[platform];
              return (
                <Field key={platform} data-invalid={error ? true : undefined}>
                  <FieldLabel htmlFor={`social-${platform}`}>
                    {socialPresentation(platform, handle).label}
                  </FieldLabel>
                  <div className="flex items-center gap-2">
                    <PrefixedInput
                      id={`social-${platform}`}
                      inputMode="url"
                      autoFocus={platform === lastAdded}
                      prefix={socialPresentation(platform, handle).prefix}
                      placeholder={socialPresentation(platform, handle).placeholder}
                      value={socials[platform] ?? ''}
                      onValueChange={(next) => {
                        form.setValue(`socials.${platform}`, next, {
                          shouldDirty: true,
                          shouldValidate: true,
                        });
                      }}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t('socialRemove', {
                        name: socialPresentation(platform, handle).label,
                      })}
                      onClick={() => {
                        removeSocial(platform);
                      }}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                  {error ? <FieldError>{messageFor(error.message)}</FieldError> : null}
                </Field>
              );
            })
          )}

          {availableSocials.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="w-fit gap-1">
                  <Plus className="size-4" />
                  {t('socialAdd')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {availableSocials.map((platform) => (
                  <DropdownMenuItem
                    key={platform}
                    onSelect={() => {
                      addSocial(platform);
                    }}
                  >
                    {socialPresentation(platform, handle).label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </FieldGroup>
      </SettingsSection>

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
