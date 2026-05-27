import Link from 'next/link';
import { ThemeToggle } from '@/components/theme-toggle';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';

/**
 * CONTEXT D-02 Phase 02 deliverable: render an honest "Phase 03 — not yet
 * wired" placeholder using <EmptyState variant="forbidden">. The existing
 * server action in `./actions.ts` and the `SignUpForm` client island
 * stay untouched — Phase 03 re-imports the form to lift the gate.
 */
export default function SignUpPage() {
  return (
    <div className="bg-muted/30 flex min-h-svh items-center justify-center p-6">
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>
      <EmptyState
        variant="forbidden"
        title="Sign-up is invite-only during early access"
        description="We're onboarding restaurants one at a time as we build out the platform. Sign in if you already have an account."
        action={
          <Button asChild>
            <Link href="/login">Back to sign in</Link>
          </Button>
        }
      />
    </div>
  );
}
