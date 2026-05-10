'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createBrandAction, type CreateBrandActionState } from '@/lib/actions/create-brand';
import {
  checkBrandSlugAvailability,
  type SlugAvailabilityResult,
} from '@/lib/actions/check-brand-slug';
import { slugifyBrandName } from '@/lib/slugify-brand';

const initial: CreateBrandActionState = { error: null };

const DEBOUNCE_MS = 300;
const MIN_SLUG_LEN = 3;

type Availability =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available' }
  | { kind: 'taken'; suggestion: string | null }
  | { kind: 'invalid' }
  | { kind: 'error' };

export const BrandForm = () => {
  const [state, action, pending] = useActionState(createBrandAction, initial);
  const [displayName, setDisplayName] = useState('');
  const [slug, setSlug] = useState('');
  // The slug auto-fills from displayName until the operator edits it
  // manually. Clearing the slug field re-arms the auto-fill so the
  // typo recovery path is "wipe + retype name" rather than "fight the
  // controller".
  const [slugTouched, setSlugTouched] = useState(false);
  const [availability, setAvailability] = useState<Availability>({ kind: 'idle' });
  const [, startCheck] = useTransition();
  const requestId = useRef(0);

  const onDisplayNameChange = (value: string): void => {
    setDisplayName(value);
    if (!slugTouched) setSlug(slugifyBrandName(value));
  };

  const onSlugChange = (value: string): void => {
    const next = value.toLowerCase();
    setSlug(next);
    setSlugTouched(next.length > 0);
  };

  const applySuggestion = (next: string): void => {
    setSlug(next);
    // Treat applying the suggestion as the operator's choice so further
    // displayName typing does NOT silently overwrite it.
    setSlugTouched(true);
  };

  // Debounced availability check on every slug change. Each effect run
  // bumps `requestId` so a stale response from a prior keystroke can't
  // overwrite the latest result.
  useEffect(() => {
    if (slug.length < MIN_SLUG_LEN) {
      setAvailability({ kind: 'idle' });
      return;
    }
    const id = ++requestId.current;
    setAvailability({ kind: 'checking' });
    const handle = setTimeout(() => {
      startCheck(() => {
        void checkBrandSlugAvailability(slug).then((res: SlugAvailabilityResult) => {
          if (id !== requestId.current) return;
          if (res.error === 'invalid') {
            setAvailability({ kind: 'invalid' });
            return;
          }
          if (res.error !== null) {
            setAvailability({ kind: 'error' });
            return;
          }
          if (res.available) {
            setAvailability({ kind: 'available' });
            return;
          }
          setAvailability({ kind: 'taken', suggestion: res.suggestion });
          // Auto-suffix only when the slug was auto-generated. If the
          // operator typed the slug themselves, surface the suggestion
          // as a hint (rendered below) instead of silently overwriting.
          if (!slugTouched && res.suggestion !== null) {
            setSlug(res.suggestion);
          }
        });
      });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(handle);
    };
  }, [slug, slugTouched]);

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
          aria-describedby="slug-availability"
        />
        <SlugAvailabilityHint state={availability} onApplySuggestion={applySuggestion} />
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

interface SlugAvailabilityHintProps {
  readonly state: Availability;
  readonly onApplySuggestion: (slug: string) => void;
}

const SlugAvailabilityHint = ({ state, onApplySuggestion }: SlugAvailabilityHintProps) => {
  if (state.kind === 'checking') {
    return (
      <p id="slug-availability" className="text-muted-foreground text-xs" aria-live="polite">
        Checking availability…
      </p>
    );
  }
  if (state.kind === 'available') {
    return (
      <p id="slug-availability" className="text-xs text-emerald-600" aria-live="polite">
        Available.
      </p>
    );
  }
  if (state.kind === 'taken') {
    const suggestion = state.suggestion;
    return (
      <p id="slug-availability" className="text-destructive text-xs" aria-live="polite">
        Taken.{' '}
        {suggestion !== null ? (
          <>
            Try{' '}
            <button
              type="button"
              className="underline underline-offset-2"
              onClick={() => {
                onApplySuggestion(suggestion);
              }}
            >
              {suggestion}
            </button>{' '}
            instead.
          </>
        ) : (
          'Pick a different slug.'
        )}
      </p>
    );
  }
  if (state.kind === 'invalid') {
    return (
      <p id="slug-availability" className="text-destructive text-xs" aria-live="polite">
        Invalid format. Lowercase letters, digits, and hyphens; 3–64 chars; no leading/trailing
        hyphen.
      </p>
    );
  }
  if (state.kind === 'error') {
    return (
      <p id="slug-availability" className="text-muted-foreground text-xs" aria-live="polite">
        Could not verify availability — you can still submit.
      </p>
    );
  }
  return (
    <p id="slug-availability" className="text-muted-foreground text-xs">
      Auto-filled from the brand name. Lowercase letters, digits, and hyphens; used in the customer
      URL.
    </p>
  );
};
