import { useState } from 'react';
import { createRoute, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Route as protectedLayoutRoute } from '../_layout';
import { apiFetch } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

export const Route = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/onboarding/brand',
  component: OnboardingPage,
});

interface OnboardingResponse {
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

const MIN_NAME_LEN = 1;

function OnboardingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = displayName.trim();
    if (trimmed.length < MIN_NAME_LEN) return;
    setPending(true);
    setError(null);
    // D-30: name only — the slug is derived server-side; collisions are
    // resolved silently via auto-suffix, never surfaced as a "taken" error.
    const res = await apiFetch<OnboardingResponse | ProblemDetails>('/v1/me/tenants/onboarding', {
      method: 'POST',
      body: { displayName: trimmed },
    });
    setPending(false);
    if (!res.ok) {
      const body = res.data as ProblemDetails | null;
      setError(body?.message ?? body?.detail ?? 'Something went wrong. Please try again.');
      return;
    }
    const tenant = res.data as OnboardingResponse;
    await queryClient.invalidateQueries({ queryKey: ['identity'] });
    toast.success(`"${tenant.displayName}" created.`);
    void navigate({ to: '/' });
  };

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Create your restaurant</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="displayName">Restaurant name</Label>
                <Input
                  id="displayName"
                  required
                  minLength={1}
                  maxLength={120}
                  value={displayName}
                  onChange={(e) => {
                    setDisplayName(e.target.value);
                  }}
                />
              </div>
              {error ? (
                <p className="text-destructive text-sm" role="alert">
                  {error}
                </p>
              ) : null}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? 'Creating…' : 'Continue'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
