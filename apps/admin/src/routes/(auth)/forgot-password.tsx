import { useState } from 'react';
import { createRoute } from '@tanstack/react-router';
import { Link } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Route as authLayoutRoute } from './_layout';
import { adminPath } from '@/lib/admin-path';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const ForgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});
type ForgotPasswordForm = z.infer<typeof ForgotPasswordSchema>;

export const Route = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/forgot-password',
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<ForgotPasswordForm>({ resolver: zodResolver(ForgotPasswordSchema) });

  const onSubmit = async (data: ForgotPasswordForm) => {
    setError(null);
    try {
      const res = await fetch('/api/auth/request-password-reset', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: data.email,
          redirectTo: `${window.location.origin}${adminPath('/reset-password')}`,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status >= 500) {
        setError('Something went wrong on our side. Please try again.');
        return;
      }
    } catch {
      setError('Something went wrong. Please try again.');
      return;
    }
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <Card>
        <CardContent className="space-y-4 pt-6 text-sm">
          <p className="text-foreground">
            If the email matches an account, a password-reset link is on its way.
          </p>
          <p className="text-muted-foreground">
            Didn&apos;t arrive? Check your spam folder or try again in a few minutes.
          </p>
          <Link className="underline" to="/login">
            Back to sign in
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Reset password</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" required {...register('email')} />
          </div>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Sending…' : 'Send reset link'}
          </Button>
          <p className="text-muted-foreground text-center text-sm">
            Remembered it?{' '}
            <Link className="underline" to="/login">
              Back to sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
