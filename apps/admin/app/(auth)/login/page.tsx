import { ThemeToggle } from '@/components/theme-toggle';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoginForm } from './login-form-client';

interface PageProps {
  readonly searchParams: Promise<{
    readonly next?: string;
    readonly reset?: string;
    readonly expired?: string;
  }>;
}

/**
 * Server component. The shell renders without any client JS; the
 * form-with-state lives in a small client island
 * (`login-form-client.tsx`) so `useActionState` can surface the
 * action's `{ error }` return inline. No auth SDK on the wire, no
 * client-side fetch.
 */
export default async function LoginPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const next = params.next ?? '/dashboard';
  const resetSuccess = params.reset === 'success';
  const sessionExpired = params.expired === '1';

  return (
    <div className="bg-muted/30 flex min-h-svh items-center justify-center p-6">
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in to Resto</CardTitle>
          <CardDescription>Operator console — use your work email.</CardDescription>
        </CardHeader>
        <CardContent>
          {sessionExpired ? (
            <p role="status" className="bg-muted text-foreground mb-4 rounded-md px-3 py-2 text-sm">
              Your session expired. Please sign in again.
            </p>
          ) : null}
          {resetSuccess ? (
            <p role="status" className="bg-muted text-foreground mb-4 rounded-md px-3 py-2 text-sm">
              Password updated. Sign in with your new password.
            </p>
          ) : null}
          <LoginForm next={next} />
        </CardContent>
      </Card>
    </div>
  );
}
