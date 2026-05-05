import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoginForm } from './login-form-client';

interface PageProps {
  readonly searchParams: Promise<{ readonly next?: string }>;
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

  return (
    <div className="bg-muted/30 flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in to Resto</CardTitle>
          <CardDescription>Operator console — use your work email.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm next={next} />
        </CardContent>
      </Card>
    </div>
  );
}
