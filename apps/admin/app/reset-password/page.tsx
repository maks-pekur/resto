import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ResetPasswordForm } from './reset-password-form-client';

interface PageProps {
  readonly searchParams: Promise<{ readonly token?: string }>;
}

export default async function ResetPasswordPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const token = params.token ?? '';

  return (
    <div className="bg-muted/30 flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Choose a new password</CardTitle>
          <CardDescription>
            {token
              ? 'Pick something at least 12 characters long.'
              : 'Reset link is missing or malformed — request a new email.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {token ? (
            <ResetPasswordForm token={token} />
          ) : (
            <Link className="underline text-sm" href="/forgot-password">
              Request a new reset link
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
