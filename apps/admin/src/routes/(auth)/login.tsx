import { useState } from 'react';
import { createRoute, useNavigate } from '@tanstack/react-router';
import { Link } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { Route as authLayoutRoute } from './_layout';
import { authClient } from '@/lib/auth-client';
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
});

export const Route = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/login',
  validateSearch: SearchSchema,
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
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
    const orgs = await authClient.organization.list();
    if (orgs.data?.[0]) {
      await authClient.organization.setActive({ organizationId: orgs.data[0].id });
    }
    void navigate({ to: safeNext(next ?? '/dashboard') });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Sign in</CardTitle>
      </CardHeader>
      <CardContent>
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
