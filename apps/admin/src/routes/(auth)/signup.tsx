import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createRoute, useNavigate } from '@tanstack/react-router';
import { Link } from '@tanstack/react-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CountryCodeValue, SUPPORTED_COUNTRIES, defaultLocaleForCountry } from '@resto/domain';
import { Route as authLayoutRoute } from './_layout';
import { authClient } from '@/lib/auth-client';
import { apiFetch } from '@/lib/api-client';
import i18n from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const SignUpSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(12),
  country: CountryCodeValue,
});
type SignUpForm = z.infer<typeof SignUpSchema>;

interface SignUpResponse {
  readonly status: 'pending_verification';
}

export const Route = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/signup',
  component: SignUpPage,
});

function SignUpPage() {
  const navigate = useNavigate();
  const { t } = useTranslation('translation', { keyPrefix: 'auth.signup' });
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<SignUpForm>({
    resolver: zodResolver(SignUpSchema),
    defaultValues: { country: 'UA' },
  });

  const onSubmit = async (data: SignUpForm) => {
    setError(null);
    const signUpRes = await apiFetch<SignUpResponse>('/v1/signup', {
      method: 'POST',
      body: { name: data.name, email: data.email, password: data.password, country: data.country },
    });
    if (!signUpRes.ok) {
      setError(t('errorGeneric'));
      return;
    }
    // POST /v1/signup drops Set-Cookie for D-06 enumeration parity (the
    // response body is identical whether the email was new or already
    // taken) — the browser has no session yet. Sign in with the same
    // credentials to establish one; a failure here (e.g. the email was
    // already registered under a different password) surfaces the SAME
    // generic error as a signup failure, so the UI never distinguishes
    // "email taken" from "signup failed" either.
    const signInRes = await authClient.signIn.email({ email: data.email, password: data.password });
    if (signInRes.error) {
      setError(t('errorGeneric'));
      return;
    }
    const orgs = await authClient.organization.list();
    const org = orgs.data?.[0];
    if (!org) {
      setError(t('errorGeneric'));
      return;
    }
    await authClient.organization.setActive({ organizationId: org.id });
    void i18n.changeLanguage(defaultLocaleForCountry(data.country));
    void navigate({ to: '/onboarding' });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t('title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="name">{t('nameLabel')}</Label>
            <Input id="name" required minLength={2} maxLength={120} {...register('name')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required autoComplete="email" {...register('email')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={12}
              autoComplete="new-password"
              {...register('password')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="country">{t('countryLabel')}</Label>
            <Controller
              name="country"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="country" className="w-full">
                    <SelectValue placeholder={t('countryPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_COUNTRIES.map((code) => (
                      <SelectItem key={code} value={code}>
                        {t(`countryOption.${code.toLowerCase()}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? t('submitPending') : t('submitIdle')}
          </Button>
          <p className="text-muted-foreground text-center text-sm">
            {t('signInPrompt')}{' '}
            <Link className="underline" to="/login">
              Sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
