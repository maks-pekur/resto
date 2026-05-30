import Link from 'next/link';
import { ThemeToggle } from '@/components/theme-toggle';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { ResetPasswordForm } from './reset-password-form-client';

/**
 * Phase 03 AUTH-05: replaces the Phase 02 EmptyState placeholder with the
 * real reset form. BA's reset link arrives as `${ADMIN_WEB_URL}/reset-password?token=<...>`;
 * the token is rendered into a hidden field and POSTed to BA via the
 * server action in `./actions.ts`. On success, BA's `hooks.after` cascade
 * (auth.config.ts:285-307) revokes all sessions for the user and the
 * action redirects to `/login?reset=success`.
 *
 * `?next=` is not honored on this route — BA's reset endpoint always
 * lands at the sign-in page once the password is changed.
 */
interface ResetPasswordPageProps {
  readonly searchParams: Promise<{ token?: string }>;
}

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const params = await searchParams;
  const token = typeof params.token === 'string' ? params.token : '';

  return (
    <div className="bg-muted/30 flex min-h-svh items-center justify-center p-6">
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>
      {token === '' ? (
        <EmptyState
          variant="forbidden"
          title="Missing reset token"
          description="The reset link is missing the token parameter. Request a new password reset email and try again."
          action={
            <Button asChild>
              <Link href="/forgot-password">Request a new link</Link>
            </Button>
          }
        />
      ) : (
        <div className="bg-background w-full max-w-md space-y-6 rounded-lg p-8 shadow">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Set a new password</h1>
            <p className="text-muted-foreground text-sm">
              Pick a password at least 12 characters long. All your other sessions will be signed
              out for safety.
            </p>
          </div>
          <ResetPasswordForm token={token} />
        </div>
      )}
    </div>
  );
}
