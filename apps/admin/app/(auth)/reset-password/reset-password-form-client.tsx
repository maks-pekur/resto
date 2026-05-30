'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { resetPasswordAction, type ResetPasswordActionState } from './actions';

const initial: ResetPasswordActionState = { error: null };

export const ResetPasswordForm = ({ token }: { readonly token: string }) => {
  const [state, action, pending] = useActionState(resetPasswordAction, initial);

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="token" value={token} />
      <div className="space-y-2">
        <Label htmlFor="newPassword">New password</Label>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
        />
      </div>
      {state.error ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Saving…' : 'Set new password'}
      </Button>
      <p className="text-muted-foreground text-center text-sm">
        Remembered it?{' '}
        <Link className="underline" href="/login">
          Back to sign in
        </Link>
      </p>
    </form>
  );
};
