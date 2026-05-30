import Link from 'next/link';
import { ThemeToggle } from '@/components/theme-toggle';
import { SignUpForm } from './signup-form-client';

/**
 * Phase 03 AUTH-06 + D-06: replaces the Phase 02 EmptyState placeholder
 * with the real sign-up form. The form posts to `/v1/signup` which now
 * returns the enumeration-safe `{ status: 'pending_verification' }`
 * response in both branches (D-06). The server action redirects to
 * `/login?signup=pending_verification` on success — admin UI deliberately
 * no longer distinguishes "email taken" from "new email" (Pattern 3
 * trade-off in 03-RESEARCH.md).
 */
export default function SignUpPage() {
  return (
    <div className="bg-muted/30 flex min-h-svh items-center justify-center p-6">
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>
      <div className="bg-background w-full max-w-md space-y-6 rounded-lg p-8 shadow">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Create your RestOS account</h1>
          <p className="text-muted-foreground text-sm">
            Sign up your restaurant. We&apos;ll email you a verification link before you can sign
            in.
          </p>
        </div>
        <SignUpForm />
        <p className="text-muted-foreground text-center text-sm">
          Already have an account?{' '}
          <Link className="underline" href="/login">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
