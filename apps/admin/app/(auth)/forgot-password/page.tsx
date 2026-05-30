import { ThemeToggle } from '@/components/theme-toggle';
import { ForgotPasswordForm } from './forgot-password-form-client';

/**
 * Phase 03 AUTH-04: replaces the Phase 02 EmptyState placeholder with the
 * real form. Submission triggers BA's `/api/auth/request-password-reset`
 * which dispatches the reset email through the wired EmailAdapterPort
 * (Plan 02). The response shape is intentionally identical for "email
 * matched" and "email did not" — see `actions.ts` for the parity comment.
 */
export default function ForgotPasswordPage() {
  return (
    <div className="bg-muted/30 flex min-h-svh items-center justify-center p-6">
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>
      <div className="bg-background w-full max-w-md space-y-6 rounded-lg p-8 shadow">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Forgot your password?</h1>
          <p className="text-muted-foreground text-sm">
            Enter the email tied to your operator account and we&apos;ll send a reset link.
          </p>
        </div>
        <ForgotPasswordForm />
      </div>
    </div>
  );
}
