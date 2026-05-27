import Link from 'next/link';
import { ThemeToggle } from '@/components/theme-toggle';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';

/**
 * CONTEXT D-02 Phase 02 deliverable: render an honest "Phase 03 — not yet
 * wired" placeholder using <EmptyState variant="forbidden">. The existing
 * server action in `./actions.ts` and the `ForgotPasswordForm` client
 * island stay untouched — Phase 03 re-imports the form to lift the gate.
 */
export default function ForgotPasswordPage() {
  return (
    <div className="bg-muted/30 flex min-h-svh items-center justify-center p-6">
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>
      <EmptyState
        variant="forbidden"
        title="Password reset is coming in Phase 03"
        description="Email-based password reset will be available shortly. For now, contact your tenant owner if you cannot sign in."
        action={
          <Button asChild>
            <Link href="/login">Back to sign in</Link>
          </Button>
        }
      />
    </div>
  );
}
