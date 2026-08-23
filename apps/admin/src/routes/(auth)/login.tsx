import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createRoute, useNavigate } from '@tanstack/react-router';
import { Link } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { Route as authLayoutRoute } from './_layout';
import { authClient } from '@/lib/auth-client';
import { apiFetch } from '@/lib/api-client';
import type { MeResponse } from '@/lib/queries/identity';
import { meTenantsQuery } from '@/lib/queries/identity';
import { adminUrlForTenant } from '@/lib/admin-host';
import { safeNext } from '@/lib/auth/safe-next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});
type LoginForm = z.infer<typeof LoginSchema>;

const SearchSchema = z.object({
  next: z.string().optional(),
  // TanStack Router's default `parseSearch` coerces a numeric-looking query
  // value (`?expired=1`) to the JS number `1` before this schema runs — a
  // plain `z.string()` then rejects it and the whole route falls to the
  // generic error boundary instead of rendering the banner (10.2 plan 19,
  // deferred-items.md "From plan 17"). Accept both shapes.
  expired: z
    .union([z.string(), z.number()])
    .transform((v) => String(v))
    .optional(),
});

interface SwitchTenantResponse {
  readonly organizationId: string;
  readonly slug: string;
}

export const Route = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/login',
  validateSearch: SearchSchema,
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { next, expired } = Route.useSearch();
  const { t: tAuth } = useTranslation('translation', { keyPrefix: 'auth' });
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(LoginSchema) });

  const onSubmit = async (data: LoginForm) => {
    setError(null);
    const res = await authClient.signIn.email({ email: data.email, password: data.password });
    if (res.error) {
      setError('Invalid email or password.');
      return;
    }

    // D-17: exactly one tenant skips the picker entirely; two or more
    // always shows it; staff belong to exactly one and never see it.
    const tenantsRes = await meTenantsQuery().queryFn();
    const tenants = tenantsRes.data?.tenants ?? [];
    if (tenants.length === 0) {
      // Defensive — /v1/signup guarantees at least one tenant.
      void navigate({ to: '/onboarding' });
      return;
    }
    if (tenants.length >= 2) {
      void navigate({ to: '/pick-tenant' });
      return;
    }
    const only = tenants[0];
    if (!only) {
      void navigate({ to: '/onboarding' });
      return;
    }

    // D-15/D-21: bind through the same revoke-and-reissue endpoint the
    // picker uses — its response carries the slug the final hard
    // navigation needs, and every tenant-bind on this session goes
    // through one mechanism, not two.
    const switchRes = await apiFetch<SwitchTenantResponse>('/api/auth/switch-organization', {
      method: 'POST',
      body: { organizationId: only.id },
    });
    if (!switchRes.ok || !switchRes.data) {
      setError('Could not sign in. Please try again.');
      return;
    }

    const meResult = await apiFetch<MeResponse>('/v1/me');
    const baseRole = meResult.data?.baseRole;
    const session = await authClient.getSession();
    const sessionData =
      session.data !== null
        ? (session.data as { session?: { activeLocationId?: string | null } }).session
        : undefined;
    const activeLocationId = sessionData?.activeLocationId ?? null;
    if (baseRole !== undefined && baseRole !== 'owner' && activeLocationId === null) {
      void navigate({ to: '/pick-location', search: { next } });
      return;
    }
    window.location.assign(adminUrlForTenant(switchRes.data.slug, safeNext(next ?? '/dashboard')));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Sign in</CardTitle>
      </CardHeader>
      <CardContent>
        {expired === '1' ? (
          <p
            data-testid="session-expired-notice"
            role="status"
            className="mb-4 rounded-md border px-3 py-2 text-sm"
          >
            {tAuth('sessionExpired')}
          </p>
        ) : null}
        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="grid gap-4" noValidate>
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" required {...register('email')} />
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link className="text-muted-foreground text-xs underline" to="/forgot-password">
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              {...register('password')}
            />
          </div>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : 'Sign in'}
          </Button>
          <p className="text-muted-foreground text-center text-sm">
            No account yet?{' '}
            <Link className="underline" to="/signup">
              Sign up
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
