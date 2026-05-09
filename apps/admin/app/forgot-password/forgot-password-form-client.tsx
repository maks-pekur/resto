'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { forgotPasswordAction, type ForgotPasswordActionState } from './actions';

const initial: ForgotPasswordActionState = { error: null, submitted: false };

export const ForgotPasswordForm = () => {
  const [state, action, pending] = useActionState(forgotPasswordAction, initial);

  if (state.submitted) {
    return (
      <div className="space-y-4 text-sm">
        <p className="text-foreground">
          If the email matches an account, a password-reset link is on its way.
        </p>
        <p className="text-muted-foreground">
          Didn&apos;t arrive? Check your spam folder or try again in a few minutes.
        </p>
        <Link className="underline" href="/login">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      {state.error ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Sending…' : 'Send reset link'}
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
