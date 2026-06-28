import { useState } from 'react';
import { createRoute, useNavigate } from '@tanstack/react-router';
import { Link } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Route as authLayoutRoute } from './_layout';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const SignUpSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(12),
  defaultCurrency: z.string().min(1),
});
type SignUpForm = z.infer<typeof SignUpSchema>;

export const Route = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/signup',
  component: SignUpPage,
});

function SignUpPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<SignUpForm>({
    resolver: zodResolver(SignUpSchema),
    defaultValues: { defaultCurrency: 'USD' },
  });

  const onSubmit = async (data: SignUpForm) => {
    setError(null);
    const res = await authClient.signUp.email({
      email: data.email,
      password: data.password,
      name: data.displayName,
    });
    if (res.error) {
      setError(res.error.message ?? 'Could not create account. Please try again.');
      return;
    }
    void navigate({ to: '/onboarding/brand' });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Create account</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="displayName">Restaurant name</Label>
            <Input
              id="displayName"
              required
              minLength={2}
              maxLength={120}
              {...register('displayName')}
            />
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
            <Label htmlFor="defaultCurrency">Currency</Label>
            <select
              id="defaultCurrency"
              defaultValue="USD"
              className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50"
              {...register('defaultCurrency')}
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="UAH">UAH</option>
            </select>
          </div>
          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Creating account…' : 'Create account'}
          </Button>
          <p className="text-muted-foreground text-center text-sm">
            Already have an account?{' '}
            <Link className="underline" to="/login">
              Sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
