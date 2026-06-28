import { useEffect, useRef, useState } from 'react';
import { createRoute, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Route as protectedLayoutRoute } from '../_layout';
import { apiFetch } from '@/lib/api-client';
import { authClient } from '@/lib/auth-client';
import { slugifyBrandName } from '@/lib/slugify-brand';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const Route = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/onboarding/brand',
  component: OnboardingBrandPage,
});

interface BrandResponse {
  readonly id: string;
  readonly slug: string;
  readonly displayName: string;
}

interface ProblemDetails {
  type?: string;
  code?: string;
  message?: string;
  detail?: string;
  status?: number;
}

const DEBOUNCE_MS = 300;
const MIN_SLUG_LEN = 3;

type Availability =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available' }
  | { kind: 'taken'; suggestion: string | null }
  | { kind: 'invalid' }
  | { kind: 'error' };

function OnboardingBrandPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [availability, setAvailability] = useState<Availability>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const requestId = useRef(0);

  const onDisplayNameChange = (value: string) => {
    setDisplayName(value);
    if (!slugTouched) setSlug(slugifyBrandName(value));
  };

  const onSlugChange = (value: string) => {
    const next = value.toLowerCase();
    setSlug(next);
    setSlugTouched(next.length > 0);
  };

  const applySuggestion = (next: string) => {
    setSlug(next);
    setSlugTouched(true);
  };

  useEffect(() => {
    if (slug.length < MIN_SLUG_LEN) {
      setAvailability({ kind: 'idle' });
      return;
    }
    const id = ++requestId.current;
    setAvailability({ kind: 'checking' });
    const handle = setTimeout(() => {
      void apiFetch<{ available?: boolean; suggestion?: string | null }>(
        `/v1/me/brands/slug-availability?slug=${encodeURIComponent(slug)}`,
      ).then((res) => {
        if (id !== requestId.current) return;
        if (res.status === 400) {
          setAvailability({ kind: 'invalid' });
          return;
        }
        if (!res.ok || !res.data) {
          setAvailability({ kind: 'error' });
          return;
        }
        if (res.data.available === true) {
          setAvailability({ kind: 'available' });
          return;
        }
        const suggestion = typeof res.data.suggestion === 'string' ? res.data.suggestion : null;
        setAvailability({ kind: 'taken', suggestion });
        if (!slugTouched && suggestion !== null) setSlug(suggestion);
      });
    }, DEBOUNCE_MS);
    return () => { clearTimeout(handle); };
  }, [slug, slugTouched]);

  const onSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!displayName.trim() || slug.length < MIN_SLUG_LEN) return;
    setPending(true);
    setError(null);
    const res = await apiFetch<BrandResponse | ProblemDetails>('/v1/me/brands', {
      method: 'POST',
      body: { slug, displayName: displayName.trim() },
    });
    setPending(false);
    if (!res.ok) {
      const body = res.data as ProblemDetails | null;
      if (res.status === 409 && body?.code === 'brand.slug_taken') {
        setError('That brand slug is already taken; pick another.');
      } else if (res.status === 409 && body?.code === 'brand.display_name_taken') {
        setError('A brand with this name already exists; pick another name.');
      } else if (res.status === 400) {
        setError(body?.message ?? body?.detail ?? 'Please check your inputs.');
      } else {
        setError('Something went wrong. Please try again.');
      }
      return;
    }
    const brand = res.data as BrandResponse;
    await authClient.organization.setActive({ organizationId: brand.id });
    await queryClient.invalidateQueries({ queryKey: ['identity'] });
    void navigate({ to: '/dashboard/$brandSlug', params: { brandSlug: brand.slug } });
  };

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Create your first brand</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="displayName">Brand name</Label>
                <Input
                  id="displayName"
                  required
                  minLength={1}
                  maxLength={120}
                  value={displayName}
                  onChange={(e) => { onDisplayNameChange(e.target.value); }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">URL slug</Label>
                <Input
                  id="slug"
                  required
                  minLength={3}
                  maxLength={64}
                  pattern="[a-z0-9][a-z0-9-]{1,62}[a-z0-9]"
                  placeholder="z-burger"
                  value={slug}
                  onChange={(e) => { onSlugChange(e.target.value); }}
                  aria-describedby="slug-availability"
                />
                <SlugAvailabilityHint state={availability} onApplySuggestion={applySuggestion} />
              </div>
              {error ? (
                <p className="text-destructive text-sm" role="alert">
                  {error}
                </p>
              ) : null}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? 'Creating brand…' : 'Create brand'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface SlugAvailabilityHintProps {
  readonly state: Availability;
  readonly onApplySuggestion: (slug: string) => void;
}

function SlugAvailabilityHint({ state, onApplySuggestion }: SlugAvailabilityHintProps) {
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
              onClick={() => { onApplySuggestion(suggestion); }}
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
}
