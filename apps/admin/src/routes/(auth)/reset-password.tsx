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

const ResetPasswordSchema = z.object({
  newPassword: z.string().min(12),
});
type ResetPasswordForm = z.infer<typeof ResetPasswordSchema>;

const SearchSchema = z.object({
  token: z.string().optional(),
});

export const Route = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/reset-password',
  validateSearch: SearchSchema,
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const { token } = Route.useSearch();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<ResetPasswordForm>({ resolver: zodResolver(ResetPasswordSchema) });

  const onSubmit = async (data: ResetPasswordForm) => {
    if (!token) {
      setError('Invalid or missing reset token. Request a new link.');
      return;
    }
    setError(null);
    const res = await authClient.resetPassword({ newPassword: data.newPassword, token });
    if (res.error) {
      setError('Could not reset password. The link may have expired.');
      return;
    }
    void navigate({ to: '/login' });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Set new password</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="newPassword">New password</Label>
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              {...register('newPassword')}
            />
          </div>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Set new password'}
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
