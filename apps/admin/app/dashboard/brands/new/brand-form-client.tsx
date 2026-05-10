'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createBrandAction, type CreateBrandActionState } from '@/lib/actions/create-brand';

const initial: CreateBrandActionState = { error: null };

export const BrandForm = () => {
  const [state, action, pending] = useActionState(createBrandAction, initial);

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="displayName">Brand name</Label>
        <Input id="displayName" name="displayName" required minLength={1} maxLength={120} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="slug">URL slug</Label>
        <Input
          id="slug"
          name="slug"
          required
          minLength={3}
          maxLength={64}
          pattern="[a-z0-9][a-z0-9-]{1,62}[a-z0-9]"
          placeholder="z-burger"
        />
        <p className="text-muted-foreground text-xs">
          Lowercase letters, digits, and hyphens. Used in the customer URL.
        </p>
      </div>
      {state.error ? (
        <p className="text-destructive text-sm" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Creating brand…' : 'Create brand'}
      </Button>
    </form>
  );
};
