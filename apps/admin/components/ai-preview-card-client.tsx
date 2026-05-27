'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  notifyListSignupAction,
  type NotifyListSignupState,
} from '@/lib/actions/notify-list-signup';

const initialState: NotifyListSignupState = { ok: false, error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : 'Notify me'}
    </Button>
  );
}

export function AiPreviewCardClient() {
  const [state, formAction] = useActionState(notifyListSignupAction, initialState);
  if (state.ok) {
    return (
      <p role="status" className="text-muted-foreground text-sm">
        Thanks. We&apos;ll email you when AI launches.
      </p>
    );
  }
  return (
    <form action={formAction} className="flex flex-col gap-2 sm:flex-row sm:items-end" noValidate>
      <div className="flex-1 space-y-1.5">
        <Label htmlFor="ai-notify-email" className="text-xs">
          Email
        </Label>
        <Input
          id="ai-notify-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@restaurant.com"
        />
      </div>
      <SubmitButton />
      {state.error ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
