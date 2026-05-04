'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const fetchActiveOrg = async (): Promise<string | null> => {
  // BA exposes the current user's organizations after sign-in. We
  // auto-set the active org when the operator has exactly one
  // membership — anything else needs the (future) picker UI.
  const res = await authClient.organization.list();
  const orgs = res.data ?? [];
  if (orgs.length !== 1) return null;
  return orgs[0]?.id ?? null;
};

function LoginForm() {
  const router = useRouter();
  // `useSearchParams` triggers Next.js's CSR bailout at prerender time,
  // hence the surrounding Suspense boundary in the page below.
  const params = useSearchParams();
  const next = params.get('next') ?? '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (event: React.SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    void (async () => {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) {
        setError(result.error.message ?? 'Sign in failed.');
        setLoading(false);
        return;
      }

      const orgId = await fetchActiveOrg();
      if (orgId) {
        const setActive = await authClient.organization.setActive({ organizationId: orgId });
        if (setActive.error) {
          setError(setActive.error.message ?? 'Could not activate your organization.');
          setLoading(false);
          return;
        }
      }

      router.replace(next);
    })();
  };

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Sign in to Resto</CardTitle>
        <CardDescription>Operator console — use your work email.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
              }}
              disabled={loading}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
              }}
              disabled={loading}
            />
          </div>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : 'Sign in'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="bg-muted/30 flex min-h-svh items-center justify-center p-6">
      <Suspense fallback={<Loader2 className="size-6 animate-spin" />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
