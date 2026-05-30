import Link from 'next/link';
import { ThemeToggle } from '@/components/theme-toggle';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-server';
import { AcceptInvitationForm } from './accept-invitation-form-client';

interface MeResponse {
  readonly kind: 'operator' | 'customer' | 'anonymous';
  readonly userId?: string;
  readonly email?: string;
  readonly emailVerified?: boolean;
}

interface InvitationResponse {
  readonly id: string;
  readonly email: string;
  readonly role: string;
  readonly status: string;
  readonly expiresAt: string;
  readonly organizationId: string;
  readonly organizationName?: string;
  readonly organizationSlug?: string;
}

interface AcceptInvitationPageProps {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<{ next?: string }>;
}

const refineNext = (raw: unknown): string | undefined => {
  if (typeof raw !== 'string') return undefined;
  if (!raw.startsWith('/')) return undefined;
  // apps/CLAUDE.md CR-01 — block `//evil.com` protocol-relative.
  if (/^\/[\\/]/.test(raw)) return undefined;
  return raw;
};

/**
 * Phase 03 AUTH-03 accept-invitation surface. State machine (from
 * 03-03-PLAN.md interfaces block):
 *   1. Not signed in → "Sign in to accept" CTA.
 *   2. Signed in but email != invitation.email → forbidden EmptyState.
 *   3. Signed in but emailVerified=false → "Please verify your email first".
 *   4. Invitation expired / not pending → forbidden EmptyState.
 *   5. All clear → confirm button posting to actions.ts.
 *
 * `?next=` is refined against open-redirect per apps/CLAUDE.md CR-01.
 */
export default async function AcceptInvitationPage({
  params,
  searchParams,
}: AcceptInvitationPageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const safeNext = refineNext(sp.next) ?? '/dashboard';

  // Server-side fetches: BA's get-invitation is callable with or without
  // a session; the response shape is the public invitation summary.
  const invitation = await apiFetch<InvitationResponse>(
    `/api/auth/organization/get-invitation?invitationId=${encodeURIComponent(id)}`,
    { method: 'GET' },
  );
  const me = await apiFetch<MeResponse>('/v1/me');

  const shell = (children: React.ReactNode) => (
    <div className="bg-muted/30 flex min-h-svh items-center justify-center p-6">
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );

  if (!invitation.ok || !invitation.data) {
    return shell(
      <EmptyState
        variant="forbidden"
        title="Invitation invalid or expired"
        description="The link may have already been used, or the inviter revoked it."
        action={
          <Button asChild>
            <Link href="/login">Back to sign in</Link>
          </Button>
        }
      />,
    );
  }

  const inv = invitation.data;
  const expiresAt = new Date(inv.expiresAt);
  if (Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
    return shell(
      <EmptyState
        variant="forbidden"
        title="Invitation expired"
        description="Ask the inviter to send a fresh link."
        action={
          <Button asChild>
            <Link href="/login">Back to sign in</Link>
          </Button>
        }
      />,
    );
  }
  if (inv.status !== 'pending') {
    return shell(
      <EmptyState
        variant="forbidden"
        title="Invitation no longer pending"
        description="This invitation has already been accepted or revoked."
        action={
          <Button asChild>
            <Link href="/login">Back to sign in</Link>
          </Button>
        }
      />,
    );
  }

  // Not signed in: bounce the operator through /login first.
  if (!me.ok || me.data?.kind !== 'operator') {
    const loginUrl = `/login?next=${encodeURIComponent(`/accept-invitation/${id}`)}`;
    return shell(
      <div className="bg-background space-y-4 rounded-lg p-8 shadow">
        <h1 className="text-xl font-semibold">Sign in to accept the invitation</h1>
        <p className="text-muted-foreground text-sm">
          You were invited to join{' '}
          <strong>{inv.organizationName ?? inv.organizationSlug ?? 'a team'}</strong> as{' '}
          <strong>{inv.role}</strong>. Sign in to your existing account or create one, then come
          back to this page.
        </p>
        <Button asChild className="w-full">
          <Link href={loginUrl}>Sign in to continue</Link>
        </Button>
      </div>,
    );
  }

  // Signed in but with the wrong email.
  if (me.data.email && me.data.email.toLowerCase() !== inv.email.toLowerCase()) {
    return shell(
      <EmptyState
        variant="forbidden"
        title="This invitation was sent to a different email"
        description={`The invitation is addressed to ${inv.email}, but you are signed in as ${me.data.email}. Sign out and try again with the right account.`}
        action={
          <Button asChild>
            <Link href="/login">Back to sign in</Link>
          </Button>
        }
      />,
    );
  }

  // Signed in but unverified — BA's
  // EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION
  // would reject the accept call anyway; surfacing it here gives the
  // operator a clean path forward.
  if (me.data.emailVerified === false) {
    return shell(
      <EmptyState
        variant="forbidden"
        title="Please verify your email first"
        description="We sent you a verification link when you signed up. Click that link, then return to this invitation."
        action={
          <Button asChild>
            <Link href="/login">Back to sign in</Link>
          </Button>
        }
      />,
    );
  }

  // Happy path.
  return shell(
    <div className="bg-background space-y-4 rounded-lg p-8 shadow">
      <h1 className="text-xl font-semibold">Join the team</h1>
      <p className="text-muted-foreground text-sm">
        You were invited as <strong>{inv.role}</strong> to{' '}
        <strong>{inv.organizationName ?? inv.organizationSlug ?? 'a team'}</strong>. Confirm below
        and you will be redirected to your dashboard ({safeNext}).
      </p>
      <AcceptInvitationForm
        invitationId={inv.id}
        tenantLabel={inv.organizationName ?? inv.organizationSlug ?? 'team'}
      />
    </div>,
  );
}
