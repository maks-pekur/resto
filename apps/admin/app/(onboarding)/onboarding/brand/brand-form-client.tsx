'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createBrandAction, type CreateBrandActionState } from '@/lib/actions/create-brand';
import { slugifyBrandName } from '@/lib/slugify-brand';

const initial: CreateBrandActionState = { error: null };

export const BrandForm = () => {
  const [state, action, pending] = useActionState(createBrandAction, initial);
  const [displayName, setDisplayName] = useState('');
  const [slug, setSlug] = useState('');
  // The slug auto-fills from displayName until the operator edits it
  // manually. Clearing the slug field re-arms the auto-fill so the
  // typo recovery path is "wipe + retype name" rather than "fight the
  // controller".
  const [slugTouched, setSlugTouched] = useState(false);

  const onDisplayNameChange = (value: string): void => {
    setDisplayName(value);
    if (!slugTouched) setSlug(slugifyBrandName(value));
  };

  const onSlugChange = (value: string): void => {
    const next = value.toLowerCase();
    setSlug(next);
    setSlugTouched(next.length > 0);
  };

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="displayName">Brand name</Label>
        <Input
          id="displayName"
          name="displayName"
          required
          minLength={1}
          maxLength={120}
          value={displayName}
          onChange={(e) => {
            onDisplayNameChange(e.target.value);
          }}
        />
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
          value={slug}
          onChange={(e) => {
            onSlugChange(e.target.value);
          }}
        />
        <p className="text-muted-foreground text-xs">
          Auto-filled from the brand name. Lowercase letters, digits, and hyphens; used in the
          customer URL.
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
